import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import http, { bootstrapAuth } from "./authClient";
import { clearAccessToken } from "./tokenStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const navigate = useNavigate();
  // authChannel을 컴포넌트 생명주기에 맞춰 관리한다.
  // 모듈 레벨에 두면 HMR 등 환경에서 채널이 누적될 수 있으므로 ref로 보관 후 unmount 시 닫는다.
  const authChannelRef = useRef(null);
  if (!authChannelRef.current) {
    authChannelRef.current = new BroadcastChannel("bo-auth");
  }

  useEffect(() => {
    const channel = authChannelRef.current;
    let mounted = true;

    (async () => {
      const token = await bootstrapAuth();
      if (!mounted) return;

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await http.get("/bo/auth/me");
        if (mounted) setMe(res.data);
      } catch {
        clearAccessToken();
        if (mounted) setMe(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      // AuthProvider 언마운트 시 BroadcastChannel을 명시적으로 닫아 리소스를 해제한다.
      channel.close();
      authChannelRef.current = null;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post("/bo/auth/logout");
    } catch (_e) {
      // logout best-effort: token cleanup continues even if request fails
    }
    clearAccessToken();
    // reason을 함께 전달해서 다른 탭도 수동 로그아웃(logged_out)과 세션 만료(session_expired)를 구분한다.
    authChannelRef.current?.postMessage({ type: "LOGOUT", reason: "logged_out" });
    setMe(null);
    navigate("/?reason=logged_out");
  }, [navigate]);

  const value = useMemo(() => ({ loading, me, setMe, logout }), [loading, me, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
