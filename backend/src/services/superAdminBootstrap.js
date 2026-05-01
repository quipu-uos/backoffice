const { AdminUser } = require("../models/admin");
const { Permission, WRITE_ALL_MASK } = require("../config/permissions");

async function bootstrapSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) return;

  const superPerm = Permission.READ | WRITE_ALL_MASK;

  let user = await AdminUser.findOne({ email });
  if (!user) {
    await AdminUser.create({
      email,
      perm: superPerm,
      isSuperAdmin: true,
      isActive: true,
    });
    console.log("[LOG] super admin bootstrapped");
    return;
  }

  // Intentional bootstrap policy:
  // SUPER_ADMIN_EMAIL is always enforced with max admin permissions.
  // Manual perm downgrades or deactivations are reverted on next server bootstrap.
  const needsUpdate = !user.isSuperAdmin || user.perm !== superPerm || !user.isActive;
  if (needsUpdate) {
    const prevPerm = user.perm;
    const prevIsSuperAdmin = user.isSuperAdmin;
    const prevIsActive = user.isActive;
    user.isSuperAdmin = true;
    user.perm = superPerm;
    user.isActive = true;
    await user.save();
    // G섹션: DB 값이 환경변수 정책과 불일치할 경우 경고 로그를 남겨야 한다.
    console.warn(
      `[WARN] super admin mismatch detected for ${email}. ` +
        `isSuperAdmin: ${prevIsSuperAdmin} → true, ` +
        `perm: ${prevPerm} → ${superPerm}, ` +
        `isActive: ${prevIsActive} → true. ` +
        `Auto-corrected by bootstrap. 운영 알림 필요.`
    );
  }
}

module.exports = { bootstrapSuperAdmin };
