const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, requireSuperAdmin } = require("../middlewares/boAuth");
const { Permission, WRITE_ALL_MASK } = require("../config/permissions");

// 유효한 perm 비트마스크 최대값: READ | 모든 WRITE 권한
const MAX_VALID_PERM = Permission.READ | WRITE_ALL_MASK;
const { labelsToPerm, VALID_PERM_LABELS } = require("../utils/permLabels");
const { randomToken, sha256 } = require("../utils/cryptoUtil");
const { AdminInvite, AdminUser } = require("../models/admin");
const { writeAuditLog } = require("../services/auditLogService");

const router = express.Router();
const INVITE_STATUSES = new Set(["pending", "used", "expired", "revoked"]);

// RFC 5322 기반 간이 이메일 형식 검증
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.get("/", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const query = {};
    if (typeof req.query?.status === "string" && INVITE_STATUSES.has(req.query.status)) {
      query.status = req.query.status;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [invites, total] = await Promise.all([
      AdminInvite.find(query)
        .select("email perm status expiresAt invitedBy usedByUserId createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminInvite.countDocuments(query),
    ]);

    return res.json({
      data: invites,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/", requireAuth, requireSuperAdmin, async (req, res, next) => {
  const { email, perm, labels = ["read/all"], expiresInSec = 172800 } = req.body || {};
  const normEmail = String(email || "").trim().toLowerCase();
  if (!normEmail || !EMAIL_RE.test(normEmail)) {
    return res.status(400).json({ code: "INVALID_INPUT" });
  }
  if (expiresInSec < 3600 || expiresInSec > 604800) {
    return res.status(400).json({ code: "INVALID_EXPIRES" });
  }

  let invitePerm;
  if (Number.isInteger(perm) && perm >= 0) {
    // 유효 비트마스크 범위를 초과한 값은 거부한다.
    if (perm > MAX_VALID_PERM) {
      return res.status(400).json({ code: "INVALID_PERM", message: `perm must be between 0 and ${MAX_VALID_PERM}` });
    }
    invitePerm = perm | Permission.READ;
  } else {
    // labels 유효성 검사: boAdminUsers PATCH /:id/perm과 동일한 정책 적용
    if (!Array.isArray(labels)) {
      return res.status(400).json({ code: "INVALID_LABELS", message: "labels must be an array" });
    }
    const knownLabels = labels.filter((l) => VALID_PERM_LABELS.includes(l));
    if (knownLabels.length === 0) {
      return res.status(400).json({
        code: "INVALID_LABELS",
        message: `labels must include at least one of: ${VALID_PERM_LABELS.join(", ")}`,
      });
    }
    invitePerm = labelsToPerm(labels) | Permission.READ;
  }

  const token = randomToken(32);
  const tokenHash = sha256(token);

  // 기존 pending 초대 revoke + 새 초대 생성 + 감사 로그를 트랜잭션으로 묶어
  // reissue 라우트와 동일한 원자성을 보장한다.
  let session;
  let invite;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // 이미 Google 계정이 바인딩된 활성 사용자에게는 초대가 불필요하다.
      // 초대 링크를 보내도 해당 사용자는 이미 googleSub로 직접 로그인하므로 초대 플로우를 타지 않는다.
      const alreadyOnboarded = await AdminUser.findOne(
        { email: normEmail, googleSub: { $ne: null }, isActive: true },
        null,
        { session }
      ).lean();
      if (alreadyOnboarded) {
        const e = new Error("USER_ALREADY_ONBOARDED");
        e.status = 409;
        throw e;
      }

      await AdminInvite.updateMany(
        { email: normEmail, status: "pending" },
        { $set: { status: "revoked" } },
        { session }
      );

      invite = await AdminInvite.create(
        [
          {
            email: normEmail,
            perm: invitePerm,
            tokenHash,
            expiresAt: new Date(Date.now() + expiresInSec * 1000),
            invitedBy: req.auth.userId,
          },
        ],
        { session }
      ).then((arr) => arr[0]);

      await writeAuditLog({
        actorUserId: req.auth.userId,
        action: "ADMIN_INVITE_CREATED",
        after: { inviteId: String(invite._id), email: normEmail, perm: invitePerm, expiresInSec },
        req,
        session,
      });
    });
  } catch (e) {
    if (e.message === "USER_ALREADY_ONBOARDED") {
      return res.status(409).json({ code: "USER_ALREADY_ONBOARDED" });
    }
    return next(e);
  } finally {
    await session?.endSession();
  }

  return res.status(201).json({
    inviteUrl: `${process.env.BO_BACKEND_URL}/bo/auth/invite/${token}`,
  });
});

router.patch("/:id/revoke", requireAuth, requireSuperAdmin, async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ code: "NOT_FOUND" });
  }
  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const invite = await AdminInvite.findById(req.params.id).session(session);
      if (!invite) {
        const e = new Error("NOT_FOUND");
        e.status = 404;
        throw e;
      }
      if (invite.status !== "pending") {
        const e = new Error("INVITE_NOT_PENDING");
        e.status = 409;
        throw e;
      }

      invite.status = "revoked";
      await invite.save({ session });

      await writeAuditLog({
        actorUserId: req.auth.userId,
        action: "ADMIN_INVITE_REVOKED",
        after: { inviteId: String(invite._id), email: invite.email },
        req,
        session,
      });
    });
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ code: "NOT_FOUND" });
    if (e.message === "INVITE_NOT_PENDING") return res.status(409).json({ code: "INVITE_NOT_PENDING" });
    return next(e);
  } finally {
    await session?.endSession();
  }

  return res.json({ ok: true });
});

router.post("/:id/reissue", requireAuth, requireSuperAdmin, async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ code: "NOT_FOUND" });
  }
  const { perm, labels, expiresInSec = 172800 } = req.body || {};
  if (expiresInSec < 3600 || expiresInSec > 604800) {
    return res.status(400).json({ code: "INVALID_EXPIRES" });
  }

  // labels가 명시된 경우 유효성 검사: POST /와 동일한 정책 적용
  // labels.length > 0 가드를 제거해 빈 배열도 POST /와 동일하게 400으로 거부한다.
  // 빈 배열이 통과되면 labelsToPerm([]) = READ-only로 조용히 강등되는 불일치가 발생한다.
  if (labels !== undefined && !Number.isInteger(perm)) {
    if (!Array.isArray(labels)) {
      return res.status(400).json({ code: "INVALID_LABELS", message: "labels must be an array" });
    }
    const knownLabels = labels.filter((l) => VALID_PERM_LABELS.includes(l));
    if (knownLabels.length === 0) {
      return res.status(400).json({
        code: "INVALID_LABELS",
        message: `labels must include at least one of: ${VALID_PERM_LABELS.join(", ")}`,
      });
    }
  }

  let session;
  let inviteUrl;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const baseInvite = await AdminInvite.findById(req.params.id).session(session);
      if (!baseInvite) {
        const e = new Error("NOT_FOUND");
        e.status = 404;
        throw e;
      }

      // POST /와 동일하게 이미 온보딩된 사용자에게 재발급하지 않는다.
      const alreadyOnboarded = await AdminUser.findOne(
        { email: baseInvite.email, googleSub: { $ne: null }, isActive: true },
        null,
        { session }
      ).lean();
      if (alreadyOnboarded) {
        const e = new Error("USER_ALREADY_ONBOARDED");
        e.status = 409;
        throw e;
      }

      await AdminInvite.updateMany(
        { email: baseInvite.email, status: "pending" },
        { $set: { status: "revoked" } },
        { session }
      );

      let invitePerm;
      if (Number.isInteger(perm) && perm >= 0) {
        if (perm > MAX_VALID_PERM) {
          const e = new Error("INVALID_PERM");
          e.status = 400;
          throw e;
        }
        invitePerm = perm | Permission.READ;
      } else if (Array.isArray(labels)) {
        invitePerm = labelsToPerm(labels) | Permission.READ;
      } else {
        invitePerm = baseInvite.perm | Permission.READ;
      }

      const token = randomToken(32);
      const tokenHash = sha256(token);
      const created = await AdminInvite.create(
        [
          {
            email: baseInvite.email,
            perm: invitePerm,
            tokenHash,
            expiresAt: new Date(Date.now() + expiresInSec * 1000),
            invitedBy: req.auth.userId,
          },
        ],
        { session }
      ).then((arr) => arr[0]);

      await writeAuditLog({
        actorUserId: req.auth.userId,
        action: "ADMIN_INVITE_REISSUED",
        after: {
          sourceInviteId: String(baseInvite._id),
          newInviteId: String(created._id),
          email: created.email,
          perm: created.perm,
          expiresInSec,
        },
        req,
        session,
      });

      inviteUrl = `${process.env.BO_BACKEND_URL}/bo/auth/invite/${token}`;
    });
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ code: "NOT_FOUND" });
    if (e.message === "USER_ALREADY_ONBOARDED") {
      return res.status(409).json({ code: "USER_ALREADY_ONBOARDED" });
    }
    if (e.message === "INVALID_PERM") {
      return res.status(400).json({ code: "INVALID_PERM", message: `perm must be between 0 and ${MAX_VALID_PERM}` });
    }
    return next(e);
  } finally {
    await session?.endSession();
  }

  return res.status(201).json({ inviteUrl });
});

module.exports = router;
