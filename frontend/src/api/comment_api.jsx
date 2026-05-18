import axios from "axios";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

// 코멘트 목록 조회 (상태 필터 + 페이지네이션)
export const fetchComments = async ({ status, page = 1, limit = 20 } = {}) => {
  const params = { page, limit };
  if (status) params.status = status;

  const response = await axios.get(`${BASE_URL}/bo/admin/comments`, {
    params,
    withCredentials: true,
  });
  return response.data;
};

// 코멘트 승인
export const approveComment = async (id) => {
  const response = await axios.patch(
    `${BASE_URL}/bo/admin/comments/${id}/approve`,
    {},
    { withCredentials: true }
  );
  return response.data;
};

// 코멘트 거절
export const rejectComment = async (id) => {
  const response = await axios.patch(
    `${BASE_URL}/bo/admin/comments/${id}/reject`,
    {},
    { withCredentials: true }
  );
  return response.data;
};

// 코멘트 삭제
export const deleteComment = async (id) => {
  const response = await axios.delete(
    `${BASE_URL}/bo/admin/comments/${id}`,
    { withCredentials: true }
  );
  return response.data;
};
