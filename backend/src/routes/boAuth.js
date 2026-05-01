const express = require("express");
const passport = require("passport");
const mongoose = require("mongoose");
const { randomToken, sha256 } = require("../utils/cryptoUtil");
const { signAccessToken } = require("../utils/tokenUtil");
const { permToLabels } = require("../utils/permLabels");
const { toIpHash } = require("../utils/ipHash");
const { AdminUser, RefreshToken, AuthCode, AdminInvite } = require("../models/admin");
const { requireAuth } = require("../middlewares/boAuth");
const { writeAuditLog } = require("../services/auditLogService");
const { createRateLimiter } = require("../services/rateLimiterFactory");
const { getRedisClient } = require("../services/redisClient");
const ALLOWED_ORIGINS = require("../config/allowedOrigins");

const router = express.Router();

const REFRESH_GRACE_WINDOW_MS = Number(process.env.REFRESH_GRACE_WINDOW_MS || 10000);
const refreshLocks = new Map(); // in-process dedupe; distributed lock is attempted via Redis.

const oauthStartLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

const tokenExchangeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
});

const oauthCallbackLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

const refreshLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    const rt = req.cookies?.bo_rt;
    if (rt) return `rt:${sha256(rt)}`;
    return `ip:${req.ip}`;
  },
});

const inviteLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

/**
 * 분산 락 획득 결과를 status 객체로 반환한다.
 *   - { status: 'no-redis' }   : Redis 미연결 → in-memory fallback으로 진행
 *   - { status: 'acquired', redis, lockRedisKey, lockValue } : 락 획득 성공
 *   - { status: 'contention' } : 다른 프로세스가 이미 락 보유 → REFRESH_TOKEN_REVOKED 반환해야 함
 *   - { status: 'error' }      : Redis 통신 오류 → in-memory fallback으로 진행 (오류를 경합으로 오분류하지 않음)
 */
async function acquireDistributedRefreshLock(lockKey) {
  const redis = getRedisClient();
  if (!redis) return { status: "no-redis" };

  try {
    const lockValue = randomToken(16);
    const lockRedisKey = `bo:refresh-lock:${lockKey}`;
    const ok = await redis.set(lockRedisKey, lockValue, "PX", 15000, "NX");
    if (ok !== "OK") return { status: "contention" };
    return { status: "acquired", redis, lockRedisKey, lockValue };
  } catch (_e) {
    // Redis 통신 오류: 경합이 아니므로 REVOKED 처리하지 않고 in-memory fallback으로 넘긴다.
    return { status: "error" };
  }
}

async function releaseDistributedRefreshLock(lockResult) {
  if (!lockResult || lockResult.status !== "acquired") return;
  // Delete lock only if value matches (avoid deleting another owner's lock).
  const lua = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;
  try {
    await lockResult.redis.eval(lua, 1, lockResult.lockRedisKey, lockResult.lockValue);
  } catch (_e) {}
}

function parseDeviceInfo(userAgentRaw) {
  const ua = userAgentRaw || "";
  let os = "unknown";
  if (/iphone|ipad|ios/i.test(ua)) os = "ios";
  else if (/android/i.test(ua)) os = "android";
  else if (/windows/i.test(ua)) os = "windows";
  else if (/mac os x|macintosh/i.test(ua)) os = "macos";
  else if (/linux/i.test(ua)) os = "linux";

  let browser = "unknown";
  if (/edg\//i.test(ua)) browser = "edge";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "chrome";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "safari";
  else if (/firefox\//i.test(ua)) browser = "firefox";

  return { os, browser };
}

function checkRefreshCsrf(req) {
  const xrw = req.headers["x-requested-with"];
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const allowed = ALLOWED_ORIGINS;

  if (xrw !== "XMLHttpRequest") return false;
  if (!allowed.includes(origin)) return false;
  if (referer && !allowed.some((o) => referer.startsWith(o))) return false;
  return true;
}

function setRefreshCookie(res, rawToken) {
  res.cookie("bo_rt", rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/bo/auth/refresh",
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
}

function setOAuthStateCookie(res, state) {
  res.cookie("bo_oauth_state", state, {
    signed: true,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/bo/auth/google/callback",
    maxAge: 5 * 60 * 1000,
  });
}

function clearOAuthStateCookie(res) {
  res.clearCookie("bo_oauth_state", { path: "/bo/auth/google/callback" });
}

function verifyOAuthState(req, res, next) {
  const cookieState = req.signedCookies?.bo_oauth_state;
  const queryState = typeof req.query?.state === "string" ? req.query.state : "";
  if (!cookieState || !queryState || cookieState !== queryState) {
    clearOAuthStateCookie(res);
    return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=oauth_state_invalid`);
  }
  clearOAuthStateCookie(res);
  next();
}

router.get("/google", oauthStartLimiter, (req, res, next) => {
  const state = randomToken(16);
  setOAuthStateCookie(res, state);
  passport.authenticate("google", {
    session: false,
    state,
    scope: ["openid", "email", "profile"],
  })(req, res, next);
});

router.get(
  "/google/callback",
  oauthCallbackLimiter,
  verifyOAuthState,
  // 커스텀 콜백: info.message를 소문자화해서 reason으로 전달한다.
  // failureRedirect를 사용하면 info가 무시되어 모든 실패가 oauth_failed로 통합되는 문제가 있다.
  (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const reason = info?.message
          ? info.message.toLowerCase()
          : "oauth_failed";
        return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=${reason}`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  async (req, res, next) => {
    try {
      const user = req.user;
      res.clearCookie("bo_invite_token", { path: "/" });

      const code = randomToken(16);
      await AuthCode.create({
        codeHash: sha256(code),
        userId: user._id,
        expiresAt: new Date(Date.now() + 30 * 1000),
      });

      // AuthCode 생성 성공 후 lastLoginAt을 갱신한다.
      // googleStrategy에서 미리 save()하면 AuthCode 생성 실패 시에도 lastLoginAt이 찍히는
      // 불일치가 발생한다. best-effort: 갱신 실패가 로그인 플로우를 중단하지 않도록 한다.
      AdminUser.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});

      return res.redirect(`${process.env.BO_FRONTEND_URL}/auth/callback?code=${code}`);
    } catch (err) {
      return next(err);
    }
  }
);

router.post("/token-exchange", tokenExchangeLimiter, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(401).json({ code: "UNAUTHORIZED" });

    const doc = await AuthCode.findOneAndUpdate(
      {
        codeHash: sha256(code),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(401).json({ code: "UNAUTHORIZED" });

    // AuthCode 발급 후 계정이 비활성화된 케이스를 방어한다.
    // 30초 윈도우 내의 타이밍 이슈지만, 비활성 계정으로 RefreshToken이 발급되는
    // 데이터 불일치를 막기 위해 명시적으로 검증한다.
    const tokenUser = await AdminUser.findById(doc.userId).lean();
    if (!tokenUser || !tokenUser.isActive) {
      return res.status(401).json({ code: "UNAUTHORIZED" });
    }

    const rt = randomToken(32);
    const tokenHash = sha256(rt);
    const userAgent = req.headers["user-agent"] || "";
    const parsed = parseDeviceInfo(userAgent);
    await RefreshToken.create({
      userId: doc.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      deviceInfo: {
        userAgent,
        os: parsed.os,
        browser: parsed.browser,
        ipHash: toIpHash(
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || ""
        ),
        lastSeenAt: new Date(),
      },
    });

    setRefreshCookie(res, rt);
    const accessToken = signAccessToken(doc.userId);

    // J섹션: 로그인 완료(토큰 발급) 이벤트를 감사 로그에 기록한다.
    // best-effort: 로그 쓰기 실패가 로그인 자체를 막지 않도록 await하지 않는다.
    writeAuditLog({
      actorUserId: doc.userId,
      targetUserId: doc.userId,
      action: "ADMIN_LOGIN",
      after: {
        os: parsed.os,
        browser: parsed.browser,
      },
      req,
    }).catch(() => {});

    return res.json({ accessToken });
  } catch (err) {
    return next(err);
  }
});

router.get("/invite/:token", inviteLimiter, async (req, res, next) => {
  try {
    const token = req.params.token;
    const invite = await AdminInvite.findOne({ tokenHash: sha256(token) });
    if (!invite) {
      return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=invite_invalid`);
    }
    if (invite.expiresAt < new Date()) {
      if (invite.status === "pending") {
        // best-effort: status 업데이트 실패가 redirect를 막지 않도록 한다.
        // 유효성 판단은 expiresAt 비교로 이미 완료됐으며, status는 정보성 기록이다.
        invite.status = "expired";
        invite.save().catch(() => {});
      }
      return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=invite_expired`);
    }
    if (invite.status === "used") {
      return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=invite_used`);
    }
    if (invite.status === "revoked") {
      return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=invite_revoked`);
    }
    if (invite.status !== "pending") {
      return res.redirect(`${process.env.BO_FRONTEND_URL}/?reason=invite_invalid`);
    }

    res.cookie("bo_invite_token", token, {
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60 * 1000,
    });

    return res.redirect(`${process.env.BO_BACKEND_URL}/bo/auth/google`);
  } catch (err) {
    return next(err);
  }
});

// tokenHash: 호출자(/refresh 핸들러)가 이미 sha256(rawRt)로 계산한 lockKey와 동일한 값.
// 이중 계산을 피하기 위해 외부에서 전달받는다.
async function rotateRefresh(rawRt, tokenHash, req) {
  const now = Date.now();
  const session = await mongoose.startSession();
  let newRawRt;
  let userId;
  try {
    await session.withTransaction(async () => {
      // Atomic lock by tokenHash: only one request can revoke+own this token.
      const lockedOld = await RefreshToken.findOneAndUpdate(
        {
          tokenHash,
          revoked: false,
          expiresAt: { $gt: new Date(now) },
        },
        { $set: { revoked: true, revokedAt: new Date() } },
        { session, new: true }
      );
      if (!lockedOld) throw new Error("REFRESH_TOKEN_RACE_LOST");

      const user = await AdminUser.findById(lockedOld.userId).session(session);
      if (!user || !user.isActive) throw new Error("ACCOUNT_INACTIVE");

      newRawRt = randomToken(32);
      const newHash = sha256(newRawRt);
      const userAgent = req.headers["user-agent"] || "";
      const parsed = parseDeviceInfo(userAgent);

      const created = await RefreshToken.create(
        [
          {
            userId: lockedOld.userId,
            tokenHash: newHash,
            expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
            deviceInfo: {
              userAgent,
              os: parsed.os,
              browser: parsed.browser,
              ipHash: toIpHash(
                req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || ""
              ),
              lastSeenAt: new Date(),
            },
          },
        ],
        { session }
      ).then((arr) => arr[0]);

      await RefreshToken.updateOne(
        { _id: lockedOld._id },
        { $set: { replacedByTokenId: created._id } },
        { session }
      );

      userId = String(lockedOld.userId);
    });
  } catch (e) {
    if (e.message === "ACCOUNT_INACTIVE") return { error: "ACCOUNT_INACTIVE" };
    if (e.message === "REFRESH_TOKEN_RACE_LOST") {
      // No token issuance happened. Safely classify current token state.
      const current = await RefreshToken.findOne({ tokenHash });
      if (!current) return { error: "REFRESH_TOKEN_INVALID" };
      if (current.expiresAt.getTime() < now) return { error: "REFRESH_TOKEN_EXPIRED" };
      if (!current.revoked) return { error: "REFRESH_TOKEN_INVALID" };

      // revokedAt이 없는 비정상 document는 grace window 판단 자체가 불가능하다.
      // `|| 0`으로 fallback하면 elapsed가 수십억 ms가 되어 REUSE_DETECTED가 오탐되고
      // 해당 유저의 모든 세션이 일괄 revoke되는 false positive가 발생한다.
      // 데이터 손상 케이스이므로 REVOKED로 처리해 현재 요청만 거부한다.
      if (!current.revokedAt) return { error: "REFRESH_TOKEN_REVOKED" };
      const elapsed = now - current.revokedAt.getTime();
      if (elapsed <= REFRESH_GRACE_WINDOW_MS) return { error: "REFRESH_TOKEN_REVOKED" };

      // N섹션: "감사 로그 쓰기 실패도 롤백 조건" — 전체 revoke와 audit log를 새 트랜잭션으로 묶는다.
      // 기존 session은 이미 withTransaction 종료 후 catch에 진입한 상태이므로 새 세션을 시작한다.
      const reuseSession = await mongoose.startSession();
      try {
        await reuseSession.withTransaction(async () => {
          await RefreshToken.updateMany(
            { userId: current.userId, revoked: false },
            { $set: { revoked: true, revokedAt: new Date() } },
            { session: reuseSession }
          );
          await writeAuditLog({
            actorUserId: current.userId,
            targetUserId: current.userId,
            action: "REFRESH_TOKEN_REUSE_DETECTED",
            before: { tokenId: String(current._id) },
            after: { revokedAllTokens: true },
            req,
            session: reuseSession,
          });
        });
      } finally {
        await reuseSession.endSession();
      }
      return { error: "REFRESH_TOKEN_REUSE_DETECTED" };
    }
    throw e;
  } finally {
    await session.endSession();
  }

  return { accessToken: signAccessToken(userId), refreshToken: newRawRt };
}

router.post("/refresh", refreshLimiter, async (req, res, next) => {
  if (!checkRefreshCsrf(req)) return res.status(401).json({ code: "CSRF_BLOCKED" });

  const rawRt = req.cookies.bo_rt;
  if (!rawRt) return res.status(401).json({ code: "REFRESH_TOKEN_INVALID" });

  const lockKey = sha256(rawRt);

  // 1차 방어(in-process): 동일 프로세스 내에서 동일 토큰으로 이미 rotation 중이면 그 결과를 기다린다.
  if (refreshLocks.has(lockKey)) {
    try {
      const result = await refreshLocks.get(lockKey);
      if (result.error) return res.status(401).json({ code: result.error });
      setRefreshCookie(res, result.refreshToken);
      return res.json({ accessToken: result.accessToken });
    } catch (err) {
      // rotateRefresh에서 예상된 에러는 { error } 객체로 반환된다.
      // Promise rejection까지 도달하면 서버 오류이므로 전역 핸들러로 위임한다.
      return next(err);
    }
  }

  // 2차 방어(distributed): Redis 분산 락으로 다른 인스턴스와의 경합을 차단한다.
  // - contention: 다른 프로세스가 이미 락 보유 → REVOKED 반환
  // - error / no-redis: Redis 오류 또는 미연결 → in-memory 락만으로 진행 (fallback)
  const lockResult = await acquireDistributedRefreshLock(lockKey);
  if (lockResult.status === "contention") {
    return res.status(401).json({ code: "REFRESH_TOKEN_REVOKED" });
  }

  const p = rotateRefresh(rawRt, lockKey, req).finally(async () => {
    refreshLocks.delete(lockKey);
    await releaseDistributedRefreshLock(lockResult);
  });
  refreshLocks.set(lockKey, p);

  try {
    const result = await p;
    if (result.error) return res.status(401).json({ code: result.error });

    setRefreshCookie(res, result.refreshToken);
    return res.json({ accessToken: result.accessToken });
  } catch (err) {
    // rotateRefresh의 예상된 에러는 { error } 객체로 반환된다.
    // 여기까지 도달하면 DB 오류 등 서버 문제이므로 전역 핸들러로 위임한다.
    return next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  // Intentionally allow logout without requireAuth:
  // access token can be expired while refresh cookie still needs revocation.
  const rawRt = req.cookies.bo_rt;
  if (rawRt) {
    // N섹션: revoke + 감사 로그를 트랜잭션으로 묶어 원자성 보장.
    // 감사 로그 쓰기 실패 시 revoke도 롤백되어 데이터 불일치를 방지한다.
    let logoutSession;
    try {
      logoutSession = await mongoose.startSession();
      await logoutSession.withTransaction(async () => {
        const token = await RefreshToken.findOneAndUpdate(
          { tokenHash: sha256(rawRt), revoked: false },
          { $set: { revoked: true, revokedAt: new Date() } },
          { session: logoutSession, new: false }
        );
        if (token) {
          await writeAuditLog({
            actorUserId: token.userId,
            targetUserId: token.userId,
            action: "ADMIN_LOGOUT",
            after: { tokenId: String(token._id) },
            req,
            session: logoutSession,
          });
        }
      });
    } catch (err) {
      await logoutSession?.endSession();
      // DB 실패 여부와 무관하게 쿠키를 삭제한다.
      // 토큰을 DB에서 revoke하지 못했더라도 브라우저에서 쿠키를 지워
      // 이후 refresh 요청이 발생하지 않도록 best-effort로 처리한다.
      res.clearCookie("bo_rt", { path: "/bo/auth/refresh" });
      return next(err);
    }
    await logoutSession.endSession();
  }
  res.clearCookie("bo_rt", { path: "/bo/auth/refresh" });
  return res.status(200).json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  // requireAuth에서 이미 DB 조회 후 req.adminUser에 부착했으므로 재조회하지 않는다.
  // 명세 H섹션: /me는 매 요청 DB 재검증을 기본 정책으로 하며,
  // requireAuth 미들웨어가 매 요청마다 DB에서 user를 조회하므로 이 정책을 만족한다.
  const user = req.adminUser;
  return res.json({
    id: String(user._id),
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive,
    perm: user.perm,
    permLabels: permToLabels(user.perm),
  });
});

module.exports = router;
