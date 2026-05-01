import http from "../auth/authClient";

export const fetchInvites = (status, page = 1, limit = 20) => {
  const params = { page, limit };
  if (status) params.status = status;
  return http.get("/bo/admin/invites", { params }).then((r) => r.data);
};

export const createInvite = (email, labels, expiresInSec = 172800) =>
  http.post("/bo/admin/invites", { email, labels, expiresInSec }).then((r) => r.data);

export const revokeInvite = (id) =>
  http.patch(`/bo/admin/invites/${id}/revoke`).then((r) => r.data);

export const reissueInvite = (id, expiresInSec = 172800) =>
  http.post(`/bo/admin/invites/${id}/reissue`, { expiresInSec }).then((r) => r.data);
