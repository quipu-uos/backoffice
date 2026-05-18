const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      // ObjectId (Google OAuth) 또는 string (local strategy "admin") 모두 허용
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      enum: ["COMMENT_APPROVED", "COMMENT_REJECTED", "COMMENT_DELETED"],
      required: true,
    },
    before: {
      type: Object,
      default: null,
    },
    after: {
      type: Object,
      default: null,
    },
  },
  // updatedAt 불필요 — 감사 로그는 append-only
  { timestamps: { createdAt: true, updatedAt: false } }
);

// 특정 코멘트의 이력 조회
auditLogSchema.index({ targetId: 1 });
// 특정 관리자의 행동 이력 조회
auditLogSchema.index({ actorUserId: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
