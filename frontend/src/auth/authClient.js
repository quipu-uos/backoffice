import axios from "axios";
import { getAccessToken, setAccessToken, clearAccessToken } from "./tokenStore";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const http = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

const channel = new BroadcastChannel("bo-auth");
let refreshPromise = null;

// 탭이 닫힐 때 BroadcastChannel을 명시적으로 닫아 리소스를 해제한다.
// authClient는 모듈 싱글턴이므로 beforeunload가 적합한 cleanup 시점이다.
window.addEventListener("beforeunload", () => {
  channel.close();
}, { once: true });

channel.onmessage = (e) => {
  if (e.data?.type === "TOKEN_REFRESHED") {
    setAccessToken(e.data.accessToken);
    refreshPromise = null;
  }
  if (e.data?.type === "LOGOUT") {
    clearAccessToken();
    refreshPromise = null;
    // 브로드캐스트 메시지에 reason이 포함되면 해당 reason으로 이동한다.
    // 수동 로그아웃(logged_out)과 세션 만료(session_expired)를 다른 탭에서도 구분한다.
    const reason = e.data?.reason || "session_expired";
    const alreadyOnPage =
      window.location.pathname === "/" && window.location.search.includes(`reason=${reason}`);
    if (!alreadyOnPage) {
      window.location.replace(`/?reason=${reason}`);
    }
  }
};

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

async function refreshAccessToken() {
  const res = await axios.post(
    `${BASE_URL}/bo/auth/refresh`,
    {},
    {
      withCredentials: true,
      headers: { "X-Requested-With": "XMLHttpRequest" },
    }
  );
  const token = res.data.accessToken;
  setAccessToken(token);
  channel.postMessage({ type: "TOKEN_REFRESHED", accessToken: token });
  return token;
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;
    const status = error.response?.status;

    // requireAuth가 반환하는 403 ACCOUNT_INACTIVE 처리.
    // access token이 유효한 상태에서 계정이 비활성화된 경우로, 401이 아니라 refresh 분기를 타지 않는다.
    if (status === 403 && code === "ACCOUNT_INACTIVE") {
      clearAccessToken();
      channel.postMessage({ type: "LOGOUT", reason: "account_inactive" });
      window.location.replace("/?reason=account_inactive");
      return Promise.reject(error);
    }

    // refreshAccessToken()은 raw axios를 사용하므로 이 interceptor를 통과하지 않는다.
    // isRefreshCall은 항상 false이며, /refresh 관련 에러 코드는 아래 catch 블록에서 처리한다.
    if (status !== 401 || original?._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    try {
      const newToken = await refreshPromise;
      original.headers.Authorization = `Bearer ${newToken}`;
      return http(original);
    } catch (refreshErr) {
      // refreshAccessToken()이 raw axios로 호출되므로 /refresh 에러는 여기서 처리한다.
      const refreshCode = refreshErr.response?.data?.code;
      if (refreshCode === "ACCOUNT_INACTIVE") {
        clearAccessToken();
        channel.postMessage({ type: "LOGOUT", reason: "account_inactive" });
        window.location.replace("/?reason=account_inactive");
      } else {
        // REFRESH_TOKEN_REUSE_DETECTED / REFRESH_TOKEN_INVALID / REFRESH_TOKEN_EXPIRED
        // CSRF_BLOCKED / 기타 refresh 실패
        clearAccessToken();
        channel.postMessage({ type: "LOGOUT" });
        window.location.replace("/?reason=session_expired");
      }
      return Promise.reject(refreshErr);
    }
  }
);

export async function bootstrapAuth() {
  try {
    const token = await refreshAccessToken();
    return token;
  } catch {
    clearAccessToken();
    return null;
  }
}

export default http;
