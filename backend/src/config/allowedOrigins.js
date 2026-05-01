// BO_ALLOWED_ORIGINS는 서버 기동 시 한 번만 파싱하여 모듈 싱글턴으로 캐싱한다.
// CORS(app.js)와 CSRF(boAuth.js) 두 곳에서 동일 env를 각자 파싱하는 중복을 제거하고,
// 환경변수 이름이나 파싱 로직 변경 시 이 파일 한 곳만 수정하면 되도록 한다.
const ALLOWED_ORIGINS = (process.env.BO_ALLOWED_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

module.exports = ALLOWED_ORIGINS;
