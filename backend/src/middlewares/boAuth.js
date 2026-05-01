const { AdminUser } = require("../models/admin");
const { verifyAccessToken } = require("../utils/tokenUtil");

function extractBearer(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ code: "UNAUTHORIZED" });

    const payload = verifyAccessToken(token);
    const user = await AdminUser.findById(payload.sub).lean();
    if (!user) return res.status(401).json({ code: "UNAUTHORIZED" });
    if (!user.isActive) return res.status(403).json({ code: "ACCOUNT_INACTIVE" });

    req.auth = {
      userId: String(user._id),
      perm: user.perm,
      isSuperAdmin: user.isSuperAdmin,
    };
    // 전체 user 객체를 부착해 downstream 핸들러(예: /me)의 이중 DB 조회를 방지한다.
    req.adminUser = user;

    next();
  } catch (err) {
    // JWT 오류(서명 불일치, 만료, 형식 오류)는 인증 실패(401)로 처리한다.
    // 그 외(DB 연결 오류 등) 예상치 못한 에러는 전역 에러 핸들러로 위임해 500으로 응답한다.
    // JWT 오류 외에 CastError도 401로 처리한다.
    // payload.sub가 유효하지 않은 ObjectId인 경우 findById에서 CastError가 발생하며,
    // 이는 비정상 토큰으로 인한 인증 실패이므로 500 대신 401을 반환한다.
    const isJwtError =
      err.name === "JsonWebTokenError" ||
      err.name === "TokenExpiredError" ||
      err.name === "NotBeforeError" ||
      err.name === "CastError";
    if (isJwtError) return res.status(401).json({ code: "UNAUTHORIZED" });
    return next(err);
  }
}

function requirePerm(mask) {
  return (req, res, next) => {
    // requireAuth 없이 단독 사용 시 req.auth가 undefined이면 TypeError가 발생한다.
    // requirePerm은 항상 requireAuth 뒤에 체인해야 하지만, 실수를 방지하기 위해 방어 가드를 둔다.
    if (!req.auth) return res.status(401).json({ code: "UNAUTHORIZED" });
    if ((req.auth.perm & mask) === mask) return next();
    return res.status(403).json({ code: "PERMISSION_DENIED" });
  };
}

function requireSuperAdmin(req, res, next) {
  if (req.auth.isSuperAdmin) return next();
  return res.status(403).json({ code: "SUPER_ADMIN_REQUIRED" });
}

module.exports = { requireAuth, requirePerm, requireSuperAdmin };
