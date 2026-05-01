import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function RequireAuth({ children }) {
  const { loading, me } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!me) {
    // 로그인 성공 후 원래 접근하려던 페이지로 복귀할 수 있도록 URL을 저장한다.
    // OAuth redirect를 거치면 React Router state가 소실되므로 sessionStorage를 사용한다.
    // search(query string)도 포함해야 /recruitDB?filter=abc 같은 경로가 유실되지 않는다.
    sessionStorage.setItem("bo_redirect_after_login", location.pathname + location.search);
    return <Navigate to="/" replace />;
  }

  return children;
}
