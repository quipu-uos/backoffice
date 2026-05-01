import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

// 슈퍼어드민 전용 라우트 보호 컴포넌트.
// RequireAuth 내부에 중첩해서 사용한다: RequireAuth → RequireSuperAdmin → children.
// 슈퍼어드민이 아닌 경우 /recruitDB로 리다이렉트한다.
export default function RequireSuperAdmin({ children }) {
  const { loading, me } = useAuth();

  if (loading) return null;
  if (!me?.isSuperAdmin) return <Navigate to="/recruitDB" replace />;

  return children;
}
