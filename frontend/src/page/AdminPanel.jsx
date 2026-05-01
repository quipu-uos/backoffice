import React, { useState, useEffect } from "react";
import "../style/adminPanel.css";
import { useAuth } from "../auth/AuthProvider";
import toast from "../hook/toastUtil";
import {
  fetchAdminUsers,
  changeUserPerm,
  changeUserActive,
  changeUserSuperAdmin,
} from "../api/adminUsers_api";
import {
  fetchInvites,
  createInvite,
  revokeInvite,
  reissueInvite,
} from "../api/adminInvites_api";

// 백엔드 permToLabels와 동일한 로직. 비트마스크 → 라벨 배열.
const WRITE_ALL_MASK = 2 | 4 | 8;
const PERM_MAP = [
  { bit: 1, label: "read/all" },
  { bit: 2, label: "write/activity" },
  { bit: 4, label: "write/recruit-form" },
  { bit: 8, label: "write/club-info" },
];

function permToLabels(perm) {
  if (!perm) return ["read/all"];
  if ((perm & WRITE_ALL_MASK) === WRITE_ALL_MASK) return ["read/all", "write/all"];
  return PERM_MAP.filter(({ bit }) => perm & bit).map(({ label }) => label);
}

const WRITE_OPTIONS = ["write/activity", "write/recruit-form", "write/club-info"];

const EXPIRES_OPTIONS = [
  { value: 3600,   label: "1시간" },
  { value: 86400,  label: "1일" },
  { value: 172800, label: "2일" },
  { value: 604800, label: "7일" },
];

const STATUS_OPTIONS = [
  { value: "",         label: "전체" },
  { value: "pending",  label: "대기중" },
  { value: "used",     label: "사용됨" },
  { value: "expired",  label: "만료됨" },
  { value: "revoked",  label: "취소됨" },
];

const STATUS_BADGE = {
  pending: "badge-pending",
  used:    "badge-used",
  expired: "badge-expired",
  revoked: "badge-revoked",
};

const STATUS_KO = {
  pending: "대기중",
  used:    "사용됨",
  expired: "만료됨",
  revoked: "취소됨",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success("클립보드에 복사됐습니다."))
    .catch(() => toast.error("복사에 실패했습니다."));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { me, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("users");

  // ── Users state ───────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);

  // 권한 변경 모달
  const [permModal, setPermModal] = useState(null); // { userId, email, initialLabels }
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [permSaving, setPermSaving] = useState(false);

  // ── Invites state ─────────────────────────────────────────────────────────
  const [invites, setInvites] = useState([]);
  const [invitesPage, setInvitesPage] = useState(1);
  const [invitesTotalPages, setInvitesTotalPages] = useState(1);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  // 초대 생성 폼
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteWriteLabels, setInviteWriteLabels] = useState([]);
  const [inviteExpiry, setInviteExpiry] = useState(172800);
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");
  // "created" | "reissued" — 생성된 URL의 출처를 구분해 배너 레이블에 사용한다.
  const [createdUrlType, setCreatedUrlType] = useState("created");

  // ── Data loaders ──────────────────────────────────────────────────────────

  async function loadUsers(page = 1) {
    setUsersLoading(true);
    try {
      const data = await fetchAdminUsers(page);
      setUsers(data.data);
      setUsersTotalPages(data.pagination.totalPages);
      setUsersPage(page);
    } catch {
      toast.error("사용자 목록을 불러오지 못했습니다.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadInvites(page = 1, status = statusFilter) {
    setInvitesLoading(true);
    try {
      const data = await fetchInvites(status, page);
      setInvites(data.data);
      setInvitesTotalPages(data.pagination.totalPages);
      setInvitesPage(page);
    } catch {
      toast.error("초대 목록을 불러오지 못했습니다.");
    } finally {
      setInvitesLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "users") loadUsers(1);
    // 탭 전환 시 초대 URL 초기화: 이전 URL이 잔류하지 않도록 한다.
    if (activeTab !== "invites") { setCreatedUrl(""); setCreatedUrlType("created"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "invites") loadInvites(1, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, statusFilter]);

  // ── User handlers ─────────────────────────────────────────────────────────

  function openPermModal(user) {
    let labels = permToLabels(user.perm);
    // permToLabels가 "write/all"을 반환하는 경우(perm=15) 개별 라벨로 전개한다.
    // "write/all" 리터럴이 selectedLabels에 남으면 개별 checkbox 토글 시
    // filter(l => l !== "write/all") 후 나머지 write 권한이 모두 소실된다.
    if (labels.includes("write/all")) {
      labels = ["read/all", ...WRITE_OPTIONS];
    }
    // initialLabels를 저장해 저장 시점에 변경 여부를 비교한다.
    setPermModal({ userId: user._id, email: user.email, initialLabels: labels });
    setSelectedLabels(labels);
  }

  function toggleModalLabel(label) {
    if (label === "write/all") {
      const allSelected = WRITE_OPTIONS.every((l) => selectedLabels.includes(l));
      setSelectedLabels(allSelected ? ["read/all"] : ["read/all", ...WRITE_OPTIONS]);
      return;
    }
    setSelectedLabels((prev) =>
      prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label]
    );
  }

  async function savePermissions() {
    if (!permModal) return;

    // 변경 사항이 없으면 API 호출 없이 모달만 닫는다.
    const sorted = (arr) => [...arr].sort().join(",");
    if (sorted(selectedLabels) === sorted(permModal.initialLabels)) {
      setPermModal(null);
      return;
    }

    setPermSaving(true);
    try {
      const labels = selectedLabels.length ? selectedLabels : ["read/all"];
      await changeUserPerm(permModal.userId, labels);
      toast.success("권한이 변경됐습니다.");
      setPermModal(null);
      loadUsers(usersPage);
    } catch (err) {
      const code = err.response?.data?.code;
      toast.error(code === "INVALID_LABELS" ? "유효하지 않은 권한입니다." : "권한 변경에 실패했습니다.");
    } finally {
      setPermSaving(false);
    }
  }

  function handleToggleActive(user) {
    const next = !user.isActive;
    const action = next ? "활성화" : "비활성화";
    toast.confirm(
      `${user.email} 계정을 ${action}하시겠습니까?`,
      async () => {
        try {
          await changeUserActive(user._id, next);
          toast.success(`계정이 ${action}됐습니다.`);
          loadUsers(usersPage);
        } catch (err) {
          const code = err.response?.data?.code;
          if (code === "SELF_DEACTIVATION_FORBIDDEN") toast.error("본인 계정은 비활성화할 수 없습니다.");
          else toast.error(`${action}에 실패했습니다.`);
        }
      },
      null, "확인", "취소", next ? "success" : "error"
    );
  }

  function handleToggleSuperAdmin(user) {
    const next = !user.isSuperAdmin;
    const action = next ? "슈퍼어드민 부여" : "슈퍼어드민 해제";
    toast.confirm(
      `${user.email} 계정을 ${action}하시겠습니까?`,
      async () => {
        try {
          await changeUserSuperAdmin(user._id, next);
          toast.success(`${action}됐습니다.`);
          loadUsers(usersPage);
        } catch (err) {
          const code = err.response?.data?.code;
          if (code === "SELF_SUPER_ADMIN_DOWNGRADE_FORBIDDEN") toast.error("본인의 슈퍼어드민은 해제할 수 없습니다.");
          else if (code === "LAST_SUPER_ADMIN_FORBIDDEN") toast.error("마지막 슈퍼어드민은 해제할 수 없습니다.");
          else toast.error(`${action}에 실패했습니다.`);
        }
      },
      null, "확인", "취소", next ? "success" : "error"
    );
  }

  // ── Invite handlers ───────────────────────────────────────────────────────

  async function handleCreateInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) { toast.error("이메일을 입력해주세요."); return; }
    setCreating(true);
    setCreatedUrl("");
    try {
      const labels = ["read/all", ...inviteWriteLabels];
      const result = await createInvite(inviteEmail.trim(), labels, inviteExpiry);
      setCreatedUrl(result.inviteUrl);
      setCreatedUrlType("created");
      setInviteEmail("");
      setInviteWriteLabels([]);
      toast.success("초대 링크가 생성됐습니다.");
      loadInvites(1, statusFilter);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "INVALID_INPUT")         toast.error("이메일 형식을 확인해주세요.");
      else if (code === "USER_ALREADY_ONBOARDED") toast.error("이미 가입된 사용자입니다.");
      else toast.error("초대 링크 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  function toggleInviteWriteLabel(label) {
    if (label === "write/all") {
      const allSelected = WRITE_OPTIONS.every((l) => inviteWriteLabels.includes(l));
      setInviteWriteLabels(allSelected ? [] : [...WRITE_OPTIONS]);
      return;
    }
    setInviteWriteLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }

  function handleRevoke(invite) {
    toast.confirm(
      `${invite.email} 초대를 취소하시겠습니까?`,
      async () => {
        try {
          await revokeInvite(invite._id);
          toast.success("초대가 취소됐습니다.");
          loadInvites(invitesPage);
        } catch (err) {
          const code = err.response?.data?.code;
          if (code === "INVITE_NOT_PENDING") toast.error("이미 처리된 초대입니다.");
          else toast.error("초대 취소에 실패했습니다.");
        }
      },
      null, "초대 취소", "아니요", "error"
    );
  }

  function handleReissue(invite) {
    toast.confirm(
      `${invite.email} 초대를 재발급하시겠습니까?`,
      async () => {
        try {
          const result = await reissueInvite(invite._id);
          setCreatedUrl(result.inviteUrl);
          setCreatedUrlType("reissued");
          toast.success("초대가 재발급됐습니다.");
          loadInvites(invitesPage);
        } catch (err) {
          const code = err.response?.data?.code;
          if (code === "USER_ALREADY_ONBOARDED") toast.error("이미 가입된 사용자입니다.");
          else toast.error("재발급에 실패했습니다.");
        }
      },
      null, "재발급", "취소", "success"
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ap-container">
      {/* 사이드바 */}
      <aside className="ap-sidebar">
        <div className="ap-logo">Quipu<br />Admin</div>
        <nav className="ap-nav">
          <button
            className={`ap-nav-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            사용자 관리
          </button>
          <button
            className={`ap-nav-btn ${activeTab === "invites" ? "active" : ""}`}
            onClick={() => setActiveTab("invites")}
          >
            초대 관리
          </button>
        </nav>
        <button className="ap-logout" onClick={logout}>logout</button>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="ap-main">
        {activeTab === "users" && (
          <>
            <h2 className="ap-section-title">사용자 관리</h2>
            <div className="ap-table-wrap">
              {usersLoading ? (
                <div className="ap-loading">불러오는 중...</div>
              ) : users.length === 0 ? (
                <div className="ap-empty">등록된 사용자가 없습니다.</div>
              ) : (
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>이메일</th>
                      <th>권한</th>
                      <th>상태</th>
                      <th>슈퍼어드민</th>
                      <th>최근 로그인</th>
                      <th>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSelf = user.email === me?.email;
                      const labels = permToLabels(user.perm);
                      return (
                        <tr key={user._id}>
                          <td>{user.name || "-"}</td>
                          <td style={{ fontSize: 12 }}>{user.email}</td>
                          <td style={{ fontSize: 12 }}>{labels.join(", ")}</td>
                          <td>
                            <span className={`badge ${user.isActive ? "badge-active" : "badge-inactive"}`}>
                              {user.isActive ? "활성" : "비활성"}
                            </span>
                          </td>
                          <td>
                            {user.isSuperAdmin && (
                              <span className="badge badge-super">슈퍼</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>{formatDate(user.lastLoginAt)}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                              <button className="btn btn-sm btn-ghost" onClick={() => openPermModal(user)}>
                                권한
                              </button>
                              <button
                                className={`btn btn-sm ${user.isActive ? "btn-danger" : "btn-secondary"}`}
                                disabled={isSelf && user.isActive}
                                title={isSelf && user.isActive ? "본인 계정은 비활성화할 수 없습니다" : ""}
                                onClick={() => handleToggleActive(user)}
                              >
                                {user.isActive ? "비활성화" : "활성화"}
                              </button>
                              <button
                                className={`btn btn-sm ${user.isSuperAdmin ? "btn-ghost" : "btn-secondary"}`}
                                disabled={isSelf && user.isSuperAdmin}
                                title={isSelf && user.isSuperAdmin ? "본인의 슈퍼어드민은 해제할 수 없습니다" : ""}
                                onClick={() => handleToggleSuperAdmin(user)}
                              >
                                {user.isSuperAdmin ? "슈퍼 해제" : "슈퍼 부여"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <Pagination
                page={usersPage}
                totalPages={usersTotalPages}
                onPageChange={(p) => loadUsers(p)}
                disabled={usersLoading}
              />
            </div>
          </>
        )}

        {activeTab === "invites" && (
          <>
            <h2 className="ap-section-title">초대 관리</h2>

            {/* 초대 생성 폼 */}
            <div className="ap-form-card">
              <h3>새 초대 링크 생성</h3>
              <form onSubmit={handleCreateInvite}>
                <div className="ap-form-row">
                  <div className="ap-form-group">
                    <label>이메일</label>
                    <input
                      type="email"
                      placeholder="초대할 이메일 주소"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      style={{ width: 260 }}
                      required
                    />
                  </div>
                  <div className="ap-form-group">
                    <label>만료 기간</label>
                    <select
                      value={inviteExpiry}
                      onChange={(e) => setInviteExpiry(Number(e.target.value))}
                    >
                      {EXPIRES_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="ap-form-group" style={{ marginBottom: 16 }}>
                  <label>부여할 권한</label>
                  <div className="ap-checkboxes">
                    <label>
                      <input type="checkbox" checked disabled readOnly />
                      read/all (기본)
                    </label>
                    {WRITE_OPTIONS.map((l) => (
                      <label key={l}>
                        <input
                          type="checkbox"
                          checked={inviteWriteLabels.includes(l)}
                          onChange={() => toggleInviteWriteLabel(l)}
                        />
                        {l}
                      </label>
                    ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={WRITE_OPTIONS.every((l) => inviteWriteLabels.includes(l))}
                        onChange={() => toggleInviteWriteLabel("write/all")}
                      />
                      write/all
                    </label>
                  </div>
                </div>

                <button className="btn btn-primary" type="submit" disabled={creating}>
                  {creating ? "생성 중..." : "초대 링크 생성"}
                </button>
              </form>

            </div>

            {/* 생성/재발급된 초대 URL — form card 외부에 표시해 출처를 명확히 구분한다 */}
            {createdUrl && (
              <div className="ap-invite-url" style={{ marginBottom: 16 }}>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: "#166534" }}>
                  {createdUrlType === "reissued" ? "재발급된 초대 링크" : "생성된 초대 링크"}
                </span>
                <code style={{ flex: 1 }}>{createdUrl}</code>
                <button
                  className="btn btn-sm btn-ghost"
                  type="button"
                  onClick={() => copyToClipboard(createdUrl)}
                >
                  복사
                </button>
              </div>
            )}

            {/* 상태 필터 */}
            <div className="ap-filter-row">
              <label>상태</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setInvitesPage(1);
                }}
              >
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* 초대 목록 */}
            <div className="ap-table-wrap">
              {invitesLoading ? (
                <div className="ap-loading">불러오는 중...</div>
              ) : invites.length === 0 ? (
                <div className="ap-empty">초대 내역이 없습니다.</div>
              ) : (
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>이메일</th>
                      <th>권한</th>
                      <th>상태</th>
                      <th>만료일</th>
                      <th>생성일</th>
                      <th>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => (
                      <tr key={invite._id}>
                        <td style={{ fontSize: 12 }}>{invite.email}</td>
                        <td style={{ fontSize: 12 }}>{permToLabels(invite.perm).join(", ")}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[invite.status] || ""}`}>
                            {STATUS_KO[invite.status] || invite.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{formatDate(invite.expiresAt)}</td>
                        <td style={{ fontSize: 12 }}>{formatDate(invite.createdAt)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            <button
                              className="btn btn-sm btn-danger"
                              disabled={invite.status !== "pending"}
                              onClick={() => handleRevoke(invite)}
                            >
                              초대 취소
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              disabled={invite.status === "used"}
                              title={invite.status === "used" ? "이미 가입된 사용자에게는 재발급할 수 없습니다" : ""}
                              onClick={() => handleReissue(invite)}
                            >
                              재발급
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Pagination
                page={invitesPage}
                totalPages={invitesTotalPages}
                onPageChange={(p) => loadInvites(p)}
                disabled={invitesLoading}
              />
            </div>
          </>
        )}
      </main>

      {/* 권한 변경 모달 */}
      {permModal && (
        <div className="ap-modal-overlay" onClick={() => setPermModal(null)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{permModal.email} 권한 변경</h3>
            <div className="ap-modal-labels">
              <label>
                <input type="checkbox" checked disabled readOnly />
                read/all (기본)
              </label>
              {WRITE_OPTIONS.map((label) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={selectedLabels.includes(label)}
                    onChange={() => toggleModalLabel(label)}
                  />
                  {label}
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={WRITE_OPTIONS.every((l) => selectedLabels.includes(l))}
                  onChange={() => toggleModalLabel("write/all")}
                />
                write/all
              </label>
            </div>
            <div className="ap-modal-footer">
              <button className="btn btn-ghost" onClick={() => setPermModal(null)}>
                취소
              </button>
              <button className="btn btn-primary" disabled={permSaving} onClick={savePermissions}>
                {permSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onPageChange, disabled = false }) {
  if (totalPages <= 1) return null;
  return (
    <div className="ap-pagination">
      <button
        className="ap-page-btn"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        ‹
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          className={`ap-page-btn ${p === page ? "current" : ""}`}
          disabled={disabled}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      <button
        className="ap-page-btn"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        ›
      </button>
    </div>
  );
}
