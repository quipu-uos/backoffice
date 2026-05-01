import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { setAccessToken } from "../auth/tokenStore";
import http from "../auth/authClient";
import { useAuth } from "../auth/AuthProvider";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setMe } = useAuth();
  // 언마운트 후 비동기 작업이 완료됐을 때 navigate/setMe 호출을 방지한다.
  // AbortController로 진행 중인 axios 요청을 취소하고, mounted flag로 state 변경을 차단한다.
  const mountedRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    mountedRef.current = true;

    const code = params.get("code");
    if (!code) {
      navigate("/?reason=missing_code");
      return;
    }

    axios
      .post(
        `${BASE_URL}/bo/auth/token-exchange`,
        { code },
        { withCredentials: true, signal: controller.signal }
      )
      .then(async (res) => {
        if (!mountedRef.current) return;
        setAccessToken(res.data.accessToken);

        const meRes = await http.get("/bo/auth/me", { signal: controller.signal });
        if (!mountedRef.current) return;
        setMe(meRes.data);

        // RequireAuth에서 저장해둔 접근 시도 URL로 복귀한다.
        // 없으면 기본 페이지(/recruitDB)로 이동한다.
        const redirectTo = sessionStorage.getItem("bo_redirect_after_login") || "/recruitDB";
        sessionStorage.removeItem("bo_redirect_after_login");
        navigate(redirectTo);
      })
      .catch((err) => {
        // 언마운트로 인한 abort는 무시한다.
        if (axios.isCancel(err) || !mountedRef.current) return;
        // token-exchange 실패: 서버는 UNAUTHORIZED만 반환한다.
        // OAuth 인증 단계의 상세 실패(초대 만료, 이메일 불일치 등)는
        // /google/callback에서 passport 커스텀 콜백이 처리하여 /?reason=... 으로 직접 리다이렉트한다.
        navigate("/?reason=auth_failed");
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [params, navigate, setMe]);

  return null;
}
