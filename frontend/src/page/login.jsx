import "../style/login.css";
import React from "react";
import { useSearchParams } from "react-router-dom";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

// R섹션: reason 파라미터별 사용자 안내 메시지
// /google/callback의 passport 커스텀 콜백이 info.message를 소문자화해서 전달한다.
const REASON_MESSAGES = {
  // 세션/일반
  logged_out: "로그아웃됐습니다.",
  session_expired: "세션이 만료되었습니다. 다시 로그인해 주세요.",
  auth_failed: "로그인에 실패했습니다. 다시 시도해 주세요.",
  missing_code: "인증 코드가 없습니다. 다시 로그인해 주세요.",
  // OAuth 보안
  oauth_failed: "Google 로그인에 실패했습니다. 다시 시도해 주세요.",
  oauth_state_invalid: "보안 검증에 실패했습니다. 다시 로그인해 주세요.",
  oauth_claims_invalid: "Google 인증 정보가 유효하지 않습니다. 다시 시도해 주세요.",
  email_not_verified: "Google 계정의 이메일이 인증되지 않았습니다.",
  // 초대 링크
  invite_required: "초대 링크를 통해서만 가입할 수 있습니다.",
  invite_expired: "초대 링크가 만료되었습니다. 관리자에게 재발급을 요청해 주세요.",
  invite_used: "이미 사용된 초대 링크입니다.",
  invite_revoked: "취소된 초대 링크입니다. 관리자에게 문의해 주세요.",
  invite_invalid: "유효하지 않은 초대 링크입니다.",
  // 이메일 불일치: 초대 쿠키는 10분간 유효하므로 초대 링크를 다시 클릭해 재시도할 수 있다.
  invite_email_mismatch:
    "로그인한 Google 계정이 초대된 이메일과 다릅니다. 초대 링크를 다시 클릭한 뒤 올바른 Google 계정으로 로그인해 주세요.",
  // 계정 상태
  account_inactive: "비활성화된 계정입니다. 관리자에게 문의해 주세요.",
  google_sub_conflict: "해당 Google 계정이 이미 다른 계정에 연결되어 있습니다. 관리자에게 문의해 주세요.",
};

export default function Login() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");
  const message = reason ? REASON_MESSAGES[reason] ?? "알 수 없는 오류가 발생했습니다." : null;

  const onGoogleLogin = () => {
    window.location.href = `${BASE_URL}/bo/auth/google`;
  };

  return (
    <div className="lg_container">
      <header className="lg_logo_Quipu">Quipu Admin</header>
      {message && <p className="lg_reason_message">{message}</p>}
      <div className="lg_box_login">
        <button onClick={onGoogleLogin}>Google로 로그인</button>
      </div>
    </div>
  );
}
