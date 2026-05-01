import { useAuth } from "./AuthProvider";

// 권한 체크를 /bo/auth/me의 permLabels(서버 생성 문자열 배열) 기반으로 수행한다.
// 백엔드 비트마스크 값을 FE에서 중복 정의하지 않으므로,
// 권한 추가/변경 시 백엔드만 수정하면 FE에 자동 반영된다.
//
// 사용 예:
//   const { can, isSuperAdmin } = useCan();
//   can("read/all")         → READ 보유 여부
//   can("write/activity")   → WRITE_ACTIVITY 보유 여부
//   can("write/all")        → 모든 write 권한 보유 여부
export function useCan() {
  const { me } = useAuth();
  const labels = me?.permLabels || [];

  return {
    isSuperAdmin: !!me?.isSuperAdmin,
    can: (label) => labels.includes(label),
  };
}
