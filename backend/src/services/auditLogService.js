const AuditLog = require("../models/AuditLog");

/**
 * 감사 로그를 기록한다.
 * @param {Object} params
 * @param {import("mongoose").Types.ObjectId} params.actorUserId - 액션을 수행한 관리자 ID
 * @param {import("mongoose").Types.ObjectId} params.targetId    - 대상 코멘트 ID
 * @param {string} params.action  - COMMENT_APPROVED | COMMENT_REJECTED | COMMENT_DELETED
 * @param {Object} params.before  - 변경 전 상태
 * @param {Object} [params.after] - 변경 후 상태 (삭제 시 생략)
 */
async function writeAuditLog({ actorUserId, targetId, action, before, after }) {
  await AuditLog.create({
    actorUserId,
    targetId,
    action,
    before,
    ...(after !== undefined && { after }),
  });
}

module.exports = { writeAuditLog };
