const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const mongoose = require("mongoose");
const { AdminUser, AdminInvite } = require("../models/admin");
const { Permission } = require("../config/permissions");
const { sha256 } = require("../utils/cryptoUtil");
const { writeAuditLog } = require("../services/auditLogService");

async function verifyGoogleTokenClaims(accessToken) {
  if (!accessToken) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return false;

    const payload = await res.json();
    const aud = payload.aud || payload.azp || payload.issued_to;
    const iss = payload.iss || payload.issuer;
    const validAud = aud === process.env.GOOGLE_CLIENT_ID;
    const validIss =
      !iss || iss === "accounts.google.com" || iss === "https://accounts.google.com";
    return validAud && validIss;
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = function configureGoogleStrategy() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BO_BACKEND_URL}/bo/auth/google/callback`,
        passReqToCallback: true,
      },
      async (req, accessToken, _refreshToken, profile, done) => {
        const email = (profile.emails?.[0]?.value || "").trim().toLowerCase();
        const emailVerified =
          profile._json?.email_verified === true || profile.emails?.[0]?.verified === true;
        const googleSub = profile.id;
        const name = profile.displayName || "";
        const pictureUrl = profile.photos?.[0]?.value || "";

        try {
          const oauthClaimsValid = await verifyGoogleTokenClaims(accessToken);
          if (!oauthClaimsValid) return done(null, false, { message: "OAUTH_CLAIMS_INVALID" });
          if (!emailVerified) return done(null, false, { message: "EMAIL_NOT_VERIFIED" });

          let user = await AdminUser.findOne({ googleSub });
          if (user) {
            if (!user.isActive) return done(null, false, { message: "ACCOUNT_INACTIVE" });
            // lastLoginAt 갱신은 /google/callback에서 AuthCode.create() 성공 후에 수행한다.
            // 여기서 save()하면 AuthCode 생성 실패 시에도 lastLoginAt이 갱신되는 불일치가 발생한다.
            return done(null, user);
          }

          const inviteRawToken = req.signedCookies.bo_invite_token;
          if (!inviteRawToken) return done(null, false, { message: "INVITE_REQUIRED" });
          const inviteHash = sha256(inviteRawToken);

          // 트랜잭션 외부에서 이메일 중복 여부만 사전 확인 (서브 충돌 조기 탐지)
          const existingByEmail = await AdminUser.findOne({ email });
          if (existingByEmail?.googleSub && existingByEmail.googleSub !== googleSub) {
            return done(null, false, { message: "GOOGLE_SUB_CONFLICT" });
          }

          // 이메일 불일치를 INVITE_INVALID와 구분하기 위해 트랜잭션 진입 전에 사전 확인한다.
          // tokenHash + status + expiresAt 조건으로만 조회해 invite 존재 여부를 먼저 파악하고,
          // email이 다른 경우 INVITE_EMAIL_MISMATCH를 반환해 "올바른 계정으로 재시도" 안내를 표시한다.
          // 트랜잭션 내 findOneAndUpdate는 email 조건을 포함해 원자성을 여전히 보장한다.
          const preCheckInvite = await AdminInvite.findOne({
            tokenHash: inviteHash,
            status: "pending",
            expiresAt: { $gt: new Date() },
          });
          if (!preCheckInvite) {
            return done(null, false, { message: "INVITE_INVALID" });
          }
          if (preCheckInvite.email !== email) {
            return done(null, false, { message: "INVITE_EMAIL_MISMATCH" });
          }

          const session = await mongoose.startSession();
          let createdUser;
          try {
            await session.withTransaction(async () => {
              // N섹션 동시성 방어: findOneAndUpdate의 { status: "pending" } 조건으로
              // 복수 요청이 동시에 진입해도 단 한 요청만 invite를 "used"로 전환할 수 있다.
              const invite = await AdminInvite.findOneAndUpdate(
                {
                  tokenHash: inviteHash,
                  status: "pending",
                  expiresAt: { $gt: new Date() },
                  email,
                },
                { $set: { status: "used" } },
                { session, new: false }
              );
              if (!invite) throw new Error("INVITE_INVALID");

              let targetUser = existingByEmail;
              if (targetUser) {
                // 트랜잭션 진입 후 session 내에서 재조회하여 세션 일관성 보장
                targetUser = await AdminUser.findById(targetUser._id).session(session);
                if (!targetUser) throw new Error("INVITE_INVALID");
                targetUser.googleSub = googleSub;
                targetUser.name = name;
                targetUser.pictureUrl = pictureUrl;
                targetUser.perm = invite.perm | Permission.READ;
                targetUser.isActive = true;
                targetUser.lastLoginAt = new Date();
                await targetUser.save({ session });
                createdUser = targetUser;
              } else {
                createdUser = await AdminUser.create(
                  [
                    {
                      email,
                      googleSub,
                      name,
                      pictureUrl,
                      perm: invite.perm | Permission.READ,
                      isActive: true,
                      lastLoginAt: new Date(),
                    },
                  ],
                  { session }
                ).then((arr) => arr[0]);
              }

              await AdminInvite.updateOne(
                { _id: invite._id },
                { $set: { usedByUserId: createdUser._id } },
                { session }
              );

              await writeAuditLog({
                actorUserId: createdUser._id,
                targetUserId: createdUser._id,
                action: "ADMIN_INVITE_ACCEPTED",
                after: {
                  email,
                  perm: createdUser.perm,
                  inviteId: String(invite._id),
                },
                req,
                session,
              });
            });
          } catch (txErr) {
            if (txErr.message === "INVITE_INVALID") {
              return done(null, false, { message: "INVITE_INVALID" });
            }
            // MongoDB E11000: email 또는 googleSub unique constraint 위반.
            // 동시 요청이 같은 이메일/googleSub로 create를 시도할 때 발생할 수 있다.
            if (txErr.code === 11000) {
              return done(null, false, { message: "GOOGLE_SUB_CONFLICT" });
            }
            throw txErr;
          } finally {
            await session.endSession();
          }

          return done(null, createdUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
};
