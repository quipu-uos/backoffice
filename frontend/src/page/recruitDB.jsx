import * as XLSX from "xlsx";
import React, { useState, useEffect, useCallback } from "react";
import "../style/recruitDB.css";
import {
  fetchMemberData,
  fetchAndSavePortfolio,
  recruitStateCheck,
  recruitStateChange,
} from "../api/recruitDB_api";
import {
  fetchComments,
  approveComment,
  rejectComment,
  deleteComment,
} from "../api/comment_api";
import { logout } from "../api/logout_api";
import { useNavigate } from "react-router-dom";
import toast from "../hook/toastUtil";
import { TbReload } from "react-icons/tb";
import { MdOutlineFileDownload } from "react-icons/md";

const COMMENT_STATUS_TABS = [
  { label: "대기", value: "pending" },
  { label: "승인", value: "approved" },
  { label: "거절", value: "rejected" },
  { label: "전체", value: "" },
];

function RecruitDB() {
  const [norordev, setNorordev] = useState("개발");
  const [generalData, setGeneralData] = useState([]);
  const [devData, setDevData] = useState([]);
  const [data, setData] = useState([]);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState(0);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [recruitState, setRecruitState] = useState(false);

  // 코멘트 패널 상태
  const [showCommentPanel, setShowCommentPanel] = useState(false);
  const [commentStatus, setCommentStatus] = useState("pending");
  const [comments, setComments] = useState([]);
  const [commentPagination, setCommentPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [commentPage, setCommentPage] = useState(1);
  const [commentLoading, setCommentLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchMemberData();
        setGeneralData(data);
        setDevData(data);
        setData(data);
        setNorordev("개발");
        setHighlightedRowIndex(0);
        setSelectedRowIndex(0);
      } catch (error) {
        console.error("Error fetchData", error);
        navigate("/");
      }
    };

    const getRcruitState = async () => {
      try {
        const response = await recruitStateCheck();
        setRecruitState(response.data.is_enabled);
      } catch (error) {
        console.error("Error getRcruitState", error);
        navigate("/");
      }
    };

    fetchData();
    getRcruitState();
  }, [navigate]);

  // 코멘트 목록 로드
  const loadComments = useCallback(async () => {
    setCommentLoading(true);
    try {
      const result = await fetchComments({
        status: commentStatus || undefined,
        page: commentPage,
        limit: 20,
      });
      setComments(result.data);
      setCommentPagination(result.pagination);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/");
      } else {
        toast.error("목록을 불러오는데 실패했습니다.");
      }
    } finally {
      setCommentLoading(false);
    }
  }, [commentStatus, commentPage, navigate]);

  useEffect(() => {
    if (showCommentPanel) {
      loadComments();
    }
  }, [showCommentPanel, loadComments]);

  const handleCommentTabChange = (status) => {
    setCommentStatus(status);
    setCommentPage(1);
  };

  const handleCommentApprove = async (id) => {
    try {
      await approveComment(id);
      toast.success("승인되었습니다.");
      loadComments();
    } catch {
      toast.error("승인 처리 중 오류가 발생했습니다.");
    }
  };

  const handleCommentReject = async (id) => {
    try {
      await rejectComment(id);
      toast.success("거절되었습니다.");
      loadComments();
    } catch {
      toast.error("거절 처리 중 오류가 발생했습니다.");
    }
  };

  const handleCommentDelete = (id) => {
    toast.confirm(
      "삭제하면 복구할 수 없습니다. 삭제하시겠습니까?",
      async () => {
        try {
          await deleteComment(id);
          toast.success("삭제되었습니다.");
          loadComments();
        } catch {
          toast.error("삭제 처리 중 오류가 발생했습니다.");
        }
      },
      null,
      "삭제",
      "취소",
      "error"
    );
  };

  const formatCommentDate = (iso) =>
    new Date(iso).toLocaleDateString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleLoadDataClick = () => {
    window.location.reload();
  };

  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePhoneNumberClick = (phoneNumber) => {
    navigator.clipboard
      .writeText(phoneNumber)
      .then(() => {
        toast.success("전화번호가 클립보드에 복사되었습니다.");
      })
      .catch((err) => {
        console.error("클립보드 복사를 실패하였습니다.: ", err);
      });
  };

  const handleNameClick = (student, index) => {
    setSelectedStudent(student);
    setSelectedIndex(index);
    setCurrentIndex(index);
    setShowModal(true);
    setHighlightedRowIndex(index);
    setSelectedRowIndex(index);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const nextStudent = useCallback(() => {
    const newIndex = (currentIndex + 1) % data.length;
    setCurrentIndex(newIndex);
    setSelectedStudent(data[newIndex]);
    setHighlightedRowIndex(newIndex);
    setSelectedRowIndex(newIndex);
  }, [currentIndex, data]);

  const prevStudent = useCallback(() => {
    const newIndex = (currentIndex - 1 + data.length) % data.length;
    setCurrentIndex(newIndex);
    setSelectedStudent(data[newIndex]);
    setHighlightedRowIndex(newIndex);
    setSelectedRowIndex(newIndex);
  }, [currentIndex, data]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 코멘트 패널이 열려있으면 ESC로 닫고, 나머지 키는 무시
      if (showCommentPanel) {
        if (event.key === "Escape" || event.keyCode === 27) {
          setShowCommentPanel(false);
        }
        return;
      }

      if (event.key === "ArrowUp") {
        const newIndex = (selectedRowIndex - 1 + data.length) % data.length;
        setSelectedRowIndex(newIndex);
        setHighlightedRowIndex(newIndex);
      } else if (event.key === "ArrowDown") {
        const newIndex = (selectedRowIndex + 1) % data.length;
        setSelectedRowIndex(newIndex);
        setHighlightedRowIndex(newIndex);
      } else if (event.key === "Enter") {
        handleNameClick(data[selectedRowIndex], selectedRowIndex);
      } else if (showModal) {
        if (event.key === "ArrowLeft") {
          prevStudent();
        } else if (event.key === "ArrowRight") {
          nextStudent();
        } else if (
          event.key === "p" ||
          event.key === "P" ||
          event.key === "ㅔ"
        ) {
          handlePhoneNumberClick(selectedStudent.phone_number);
        } else if (event.keyCode === 27) {
          closeModal();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedRowIndex,
    showModal,
    showCommentPanel,
    currentIndex,
    nextStudent,
    prevStudent,
    selectedStudent,
    data,
  ]);

  const onClickLogout = async () => {
    const response = await logout();
    if (response.status === 200) {
      navigate("/");
    } else {
      toast.error("로그아웃 실패!");
    }
  };

  const handleRecruitState = async () => {
    toast.confirm(
      "모집 여부를 변경하시겠습니까?",
      async () => {
        try {
          const response = await recruitStateChange();
          if (response.status === 200) {
            setRecruitState(response.data.is_enabled);
          }
        } catch (error) {
          console.error("change recruit chance 실패", error);
        }
      },
      null,
      "네",
      "아니요",
      "error"
    );
  };

  return (
    <div className="db-container">
      <div className="db-logo">
        <div className="db-logo-top">
          <span> Quipu </span>
          <span
            className="db-comment-nav"
            onClick={() => setShowCommentPanel(true)}
          >
            코멘트 관리
          </span>
        </div>
        <span className="db-logout" onClick={onClickLogout}>
          logout
        </span>
      </div>
      <div className="bottombox">
        <div className="buttonlist">
          <div className="radio-buttons">
            <label>
              <input
                type="radio"
                checked={recruitState === true}
                onChange={handleRecruitState}
              />
              모집 ON
            </label>
            <label>
              <input
                type="radio"
                checked={recruitState === false}
                onChange={handleRecruitState}
              />
              모집 OFF
            </label>
          </div>
          <div className="upload-buttons">
            <ExcelExporter generalData={generalData} devData={devData} />
            <button onClick={handleLoadDataClick}>
              <TbReload />
            </button>
          </div>
        </div>

        <div className="dbbox">
          <table>
            <thead>
              <tr>
                <th>번호</th>
                <th>이름</th>
                <th>학번</th>
                <th>학년</th>
                <th>학과</th>
                <th>전화번호</th>
                <th>제출시간</th>
              </tr>
            </thead>
            <tbody>
              {data.map((student, index) => (
                <tr
                  key={index}
                  className={`table-row ${
                    highlightedRowIndex === index ? "highlighted" : ""
                  }`}
                  onClick={() => {
                    setHighlightedRowIndex(index);
                    setSelectedRowIndex(index);
                  }}
                >
                  <td>
                    <p>{index + 1}</p>
                  </td>
                  <td onClick={() => handleNameClick(student, index)}>
                    <p className="name">{student.name}</p>
                  </td>
                  <td>
                    <p>{student.student_id}</p>
                  </td>
                  <td>
                    <p>{student.grade}</p>
                  </td>
                  <td>
                    <p>{student.major}</p>
                  </td>
                  <td
                    className="phonenumber"
                    onClick={() => handlePhoneNumberClick(student.phone_number)}
                  >
                    <p>{student.phone_number}</p>
                  </td>
                  <td>
                    <p>
                      {new Date(student.createdAt).toLocaleDateString("ko-KR", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      {new Date(student.createdAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 지원자 상세 모달 */}
      {showModal && (
        <div className="modal" onClick={closeModal}>
          <h6
            className="prev-button"
            onClick={(e) => {
              e.stopPropagation();
              prevStudent();
            }}
          >
            &#60;
          </h6>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h6 className="closebutton" onClick={closeModal}>
              x
            </h6>
            <h2>{selectedStudent.name}</h2>
            <p className="category">학년</p>
            <p className="content">{selectedStudent.grade}</p>
            <p className="category">학번</p>
            <p className="content">{selectedStudent.student_id}</p>
            <p className="category">학과</p>
            <p className="content">{selectedStudent.major}</p>
            <p className="category">전화번호</p>
            <p
              className="click-value"
              onClick={() =>
                handlePhoneNumberClick(selectedStudent.phone_number)
              }
            >
              {selectedStudent.phone_number}
            </p>
            {norordev === "개발" &&
              selectedIndex !== null &&
              selectedStudent.semina && (
                <>
                  <p className="category">세미나 활동</p>
                  <p className="content">{selectedStudent.motivation_semina}</p>
                </>
              )}
            {norordev === "개발" &&
              selectedIndex !== null &&
              selectedStudent.dev && (
                <>
                  <p className="category">개발 분야</p>
                  <p className="content">{selectedStudent.field_dev}</p>
                  <p className="category">포트폴리오 PDF</p>
                  <p
                    className="click-value"
                    onClick={() =>
                      fetchAndSavePortfolio(selectedStudent.portfolio_pdf)
                    }
                  >
                    {selectedStudent.portfolio_pdf}
                  </p>
                  <p className="category">깃허브 프로필 URL</p>
                  <p className="content">
                    <a href={selectedStudent.github_profile}>
                      {selectedStudent.github_profile}
                    </a>
                  </p>
                </>
              )}
            {norordev === "개발" &&
              selectedIndex !== null &&
              selectedStudent.study && (
                <>
                  <p className="category">스터디 활동</p>
                  <p className="content">{selectedStudent.motivation_study}</p>
                </>
              )}
            {norordev === "개발" &&
              selectedIndex !== null &&
              selectedStudent.external && (
                <>
                  <p className="category">대외 활동</p>
                  <p className="content">
                    {selectedStudent.motivation_external}
                  </p>
                </>
              )}
            <p className="category">제출시간</p>
            <p className="content">
              {new Date(selectedStudent.createdAt).toLocaleDateString("ko-KR", {
                year: "2-digit",
                month: "2-digit",
                day: "2-digit",
              })}{" "}
              {new Date(selectedStudent.createdAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <h6
            className="next-button"
            onClick={(e) => {
              e.stopPropagation();
              nextStudent();
            }}
          >
            &#62;
          </h6>
        </div>
      )}

      {/* 코멘트 관리 패널 오버레이 */}
      {showCommentPanel && (
        <div
          className="comment-panel-overlay"
          onClick={() => setShowCommentPanel(false)}
        >
          <div
            className="comment-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 패널 헤더 */}
            <div className="comment-panel-header">
              <h1>코멘트 관리</h1>
              <button
                className="comment-panel-close"
                onClick={() => setShowCommentPanel(false)}
              >
                ✕
              </button>
            </div>

            {/* 상태 필터 탭 */}
            <div className="comment-filter-tabs">
              {COMMENT_STATUS_TABS.map((tab) => (
                <button
                  key={tab.label}
                  className={`comment-filter-tab ${
                    commentStatus === tab.value ? "active" : ""
                  }`}
                  onClick={() => handleCommentTabChange(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 테이블 */}
            <div className="comment-panel-body">
              {commentLoading ? (
                <div className="comment-state-msg">불러오는 중...</div>
              ) : comments.length === 0 ? (
                <div className="comment-state-msg">코멘트가 없습니다.</div>
              ) : (
                <div className="comment-table-scroll">
                  <table className="comment-panel-table">
                    <thead>
                      <tr>
                        <th>내용</th>
                        <th>작성자</th>
                        <th>상태</th>
                        <th>등록일</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comments.map((comment) => (
                        <tr key={comment._id}>
                          <td className="comment-cell-content">
                            {comment.content}
                          </td>
                          <td className="comment-cell-author">
                            {comment.author}
                          </td>
                          <td>
                            <span
                              className={`comment-status-badge ${comment.status}`}
                            >
                              {comment.status === "pending" && "대기"}
                              {comment.status === "approved" && "승인"}
                              {comment.status === "rejected" && "거절"}
                            </span>
                          </td>
                          <td className="comment-cell-date">
                            {formatCommentDate(comment.createdAt)}
                          </td>
                          <td>
                            <div className="comment-action-buttons">
                              {comment.status !== "approved" && (
                                <button
                                  className="comment-btn-approve"
                                  onClick={() =>
                                    handleCommentApprove(comment._id)
                                  }
                                >
                                  승인
                                </button>
                              )}
                              {comment.status === "pending" && (
                                <button
                                  className="comment-btn-reject"
                                  onClick={() =>
                                    handleCommentReject(comment._id)
                                  }
                                >
                                  거절
                                </button>
                              )}
                              <button
                                className="comment-btn-delete"
                                onClick={() =>
                                  handleCommentDelete(comment._id)
                                }
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 페이지네이션 */}
            {commentPagination.totalPages > 1 && (
              <div className="comment-pagination">
                <button
                  className="comment-btn-page"
                  onClick={() => setCommentPage((p) => p - 1)}
                  disabled={commentPage <= 1}
                >
                  이전
                </button>
                <span>
                  {commentPage} / {commentPagination.totalPages}
                  <span style={{ marginLeft: 8, color: "#666" }}>
                    (총 {commentPagination.total}건)
                  </span>
                </span>
                <button
                  className="comment-btn-page"
                  onClick={() => setCommentPage((p) => p + 1)}
                  disabled={commentPage >= commentPagination.totalPages}
                >
                  다음
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RecruitDB;

// 엑셀 파일로 내보내기
function ExcelExporter({ generalData, devData }) {
  const [fileName, setFileName] = useState("퀴푸 지원 명단.xlsx");

  const exportToExcel = () => {
    const newFileName = window.prompt("저장할 파일명을 입력하세요.", fileName);
    if (newFileName) {
      setFileName(newFileName);

      const generalWorksheet = XLSX.utils.json_to_sheet(generalData);
      const devWorksheet = XLSX.utils.json_to_sheet(devData);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, generalWorksheet, "GeneralData");
      XLSX.utils.book_append_sheet(workbook, devWorksheet, "DevData");

      XLSX.writeFile(workbook, newFileName);
    }
  };

  return (
    <div>
      <button onClick={exportToExcel}>
        <MdOutlineFileDownload />
      </button>
    </div>
  );
}
