import React from "react";
import { useCan } from "../auth/useCan";

// label: "read/all" | "write/activity" | "write/recruit-form" | "write/club-info" | "write/all"
// superAdminOnly: true이면 isSuperAdmin인 경우만 렌더링
export default function Can({ label, superAdminOnly = false, children, fallback = null }) {
  const { can, isSuperAdmin } = useCan();

  if (superAdminOnly && !isSuperAdmin) return fallback;
  if (label && !can(label)) return fallback;
  return children;
}
