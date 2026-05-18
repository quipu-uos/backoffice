const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const { writeAuditLog } = require("../services/auditLogService");
const { isLoggedIn } = require("../middlewares");

// ─── 공개 라우터 ──────────────────────────────────────────────
const publicRouter = express.Router();

// 공개 API CORS: 메인 웹(MAIN_ORIGIN_DEV) + 백오피스 프론트(CLIENT_ORIGIN_DEV) 모두 허용
const commentCors = cors({
  origin: [
    process.env.CLIENT_ORIGIN_DEV,
    process.env.MAIN_ORIGIN_DEV,
    process.env.CLIENT_ORIGIN,
    process.env.MAIN_ORIGIN,
  ].filter(Boolean),
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false,
});
publicRouter.use(commentCors);
publicRouter.options("*", commentCors); // preflight

// Rate limiter: IP당 분당 5회
// req.ip 사용: 개발환경은 직접 연결 IP(스푸핑 불가), 프로덕션은 app.enable("trust proxy")로
// nginx가 설정한 실제 클라이언트 IP를 Express가 req.ip에 주입 → X-Forwarded-For 수동 파싱 불필요
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // proxy 경고 억제
  handler: (req, res) => {
    res.status(429).json({ error: { message: "TOO_MANY_REQUESTS" } });
  },
});

// POST /comments — 코멘트 등록
publicRouter.post("/comments", commentLimiter, async (req, res, next) => {
  try {
    // 허니팟: 사람은 비워두는 숨김 필드가 채워져 있으면 봇으로 간주 → 조용히 성공 반환
    if (req.body.website !== undefined && req.body.website !== "") {
      return res.status(201).json({ ok: true });
    }

    const rawContent = req.body.content;
    const rawAuthor = req.body.author;

    if (typeof rawContent !== "string" || typeof rawAuthor !== "string") {
      return res.status(400).json({ error: { message: "INVALID_INPUT" } });
    }

    const content = rawContent.trim();
    const author = rawAuthor.trim();

    if (!content || content.length > 200 || !author || author.length > 20) {
      return res.status(400).json({ error: { message: "INVALID_INPUT" } });
    }

    await Comment.create({ content, author, status: "pending" });
    return res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /comments — 승인된 코멘트 목록 조회 (페이지네이션)
publicRouter.get("/comments", async (req, res, next) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > 500) page = 500; // skip 과다로 인한 느린 쿼리 방지
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const filter = { status: "approved" };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .select("content author createdAt")
        .lean(),
      Comment.countDocuments(filter),
    ]);

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── 관리자 라우터 ──────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(isLoggedIn);

// id 형식 검증 헬퍼 — 24자 hex 여부를 명시적으로 확인
// mongoose.Types.ObjectId.isValid() 는 12바이트 문자열도 true 반환하므로 정규식 추가 검증
function isValidObjectId(id) {
  return /^[a-f\d]{24}$/i.test(id) && mongoose.Types.ObjectId.isValid(id);
}

// GET /bo/admin/comments — 전체 코멘트 목록 조회 (상태 필터 가능)
adminRouter.get("/comments", async (req, res, next) => {
  try {
    const VALID_STATUSES = ["pending", "approved", "rejected"];
    const statusQuery = req.query.status;
    const filter =
      VALID_STATUSES.includes(statusQuery) ? { status: statusQuery } : {};

    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > 500) page = 500; // skip 과다로 인한 느린 쿼리 방지
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .select("content author status createdAt updatedAt")
        .lean(),
      Comment.countDocuments(filter),
    ]);

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /bo/admin/comments/:id/approve — 코멘트 승인
adminRouter.patch("/comments/:id/approve", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: { message: "INVALID_ID" } });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: { message: "NOT_FOUND" } });
    }

    // 멱등: 이미 approved 이면 no-op
    if (comment.status === "approved") {
      return res.status(200).json({ ok: true });
    }

    const before = { status: comment.status };
    comment.status = "approved";
    await comment.save();

    await writeAuditLog({
      actorUserId: req.user._id ?? req.user.username ?? "unknown",
      targetId: comment._id,
      action: "COMMENT_APPROVED",
      before,
      after: { status: "approved" },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /bo/admin/comments/:id/reject — 코멘트 거절
adminRouter.patch("/comments/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: { message: "INVALID_ID" } });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: { message: "NOT_FOUND" } });
    }

    // 멱등: 이미 rejected 이면 no-op
    if (comment.status === "rejected") {
      return res.status(200).json({ ok: true });
    }

    const before = { status: comment.status };
    comment.status = "rejected";
    await comment.save();

    await writeAuditLog({
      actorUserId: req.user._id ?? req.user.username ?? "unknown",
      targetId: comment._id,
      action: "COMMENT_REJECTED",
      before,
      after: { status: "rejected" },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /bo/admin/comments/:id — 코멘트 삭제 (하드 삭제)
adminRouter.delete("/comments/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: { message: "INVALID_ID" } });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: { message: "NOT_FOUND" } });
    }

    // 감사 로그를 먼저 기록한 뒤 삭제 (삭제 후엔 내용 복구 불가)
    await writeAuditLog({
      actorUserId: req.user._id ?? req.user.username ?? "unknown",
      targetId: comment._id,
      action: "COMMENT_DELETED",
      before: { content: comment.content, author: comment.author, status: comment.status },
    });

    await comment.deleteOne();

    return res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = { publicRouter, adminRouter };
