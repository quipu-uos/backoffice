import http from "../auth/authClient";

export const fetchAdminUsers = (page = 1, limit = 20) =>
  http.get("/bo/admin/users", { params: { page, limit } }).then((r) => r.data);

export const changeUserPerm = (id, labels) =>
  http.patch(`/bo/admin/users/${id}/perm`, { labels }).then((r) => r.data);

export const changeUserActive = (id, isActive) =>
  http.patch(`/bo/admin/users/${id}/active`, { isActive }).then((r) => r.data);

export const changeUserSuperAdmin = (id, isSuperAdmin) =>
  http.patch(`/bo/admin/users/${id}/super-admin`, { isSuperAdmin }).then((r) => r.data);
