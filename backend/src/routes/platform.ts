import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { ok, ApiError } from "../lib/response";
import { authorizePlatform } from "../lib/auth";
import { audit } from "../services/audit";
import { getSystemSettings, updateSystemSettings } from "../services/systemSettings";
import { getGoogleDriveStatus, getR2StorageUsage, getS3StorageStatus, getStorageConfigStatus, listGoogleDriveFolder } from "../services/storage";

// Super-admin only: manage users (username/password) and the org each user operates in.
// A user belongs to exactly one org (membership). Roles are collapsed — a member = full access.

const userView = (u: any) => ({
  id: u.id,
  username: u.username,
  display_name: u.displayName,
  is_platform_admin: u.isPlatformAdmin,
  is_active: u.isActive,
  last_login_at: u.lastLoginAt,
  org: u.memberships?.[0]?.organization
    ? { id: u.memberships[0].organization.id, name: u.memberships[0].organization.name }
    : null,
});
const withOrg = { memberships: { include: { organization: true } } } as const;

async function getOrgUsage(db: any, orgId: string) {
  const [memberships, lineOaAccounts, lineGroups, lineSenders, customers, bankAccounts, billPlans, submissions, payments, messageLogs, auditLogs] = await Promise.all([
    db.membership.count({ where: { orgId } }),
    db.lineOaAccount.count({ where: { orgId } }),
    db.lineGroup.count({ where: { orgId } }),
    db.lineSender.count({ where: { orgId } }),
    db.customer.count({ where: { orgId } }),
    db.bankAccount.count({ where: { orgId } }),
    db.billPlan.count({ where: { orgId } }),
    db.paymentSubmission.count({ where: { orgId } }),
    db.payment.count({ where: { orgId } }),
    db.messageLog.count({ where: { orgId } }),
    db.auditLog.count({ where: { orgId } }),
  ]);
  return { memberships, lineOaAccounts, lineGroups, lineSenders, customers, bankAccounts, billPlans, submissions, payments, messageLogs, auditLogs };
}

// Point a user at exactly one org (creates the org if org_name given). Replaces any existing membership.
async function setUserOrg(userId: string, opts: { org_id?: string; org_name?: string }) {
  let orgId = opts.org_id;
  if (!orgId && opts.org_name) {
    const { defaultTimezone } = await getSystemSettings();
    const org = await prisma.organization.create({ data: { name: opts.org_name, timezone: defaultTimezone } });
    orgId = org.id;
  }
  if (!orgId) return;
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new ApiError("NOT_FOUND", "Organization not found");
  await prisma.membership.deleteMany({ where: { adminUserId: userId } });
  await prisma.membership.create({ data: { orgId, adminUserId: userId, role: "user" } });
}

export const platformRoutes = new Elysia({ prefix: "/api/platform" })
  .resolve(async ({ headers }: any) => ({ ctx: await authorizePlatform(headers) }))

  // Orgs list (for the assign-org dropdown when creating/editing users).
  .get("/organizations", async () =>
    ok(await prisma.organization.findMany({ include: { _count: { select: { memberships: true, customers: true } } }, orderBy: { createdAt: "asc" } }))
  )

  // Rename / activate-deactivate an org.
  .patch("/organizations/:id", async ({ params, body, ctx }: any) => {
    const org = await prisma.organization.findUnique({ where: { id: params.id } });
    if (!org) throw new ApiError("NOT_FOUND", "Organization not found");
    const data: any = {};
    if (body?.name !== undefined) data.name = body.name;
    if (body?.is_active !== undefined) data.isActive = !!body.is_active;
    if (body?.gdrive_folder_id !== undefined) data.gdriveFolderId = body.gdrive_folder_id || null;
    const updated = await prisma.organization.update({ where: { id: params.id }, data });
    await audit(prisma, { action: "update_org", entityType: "organization", entityId: org.id, orgId: org.id, actorId: ctx.userId, newValue: data });
    return ok({ id: updated.id, name: updated.name, is_active: updated.isActive, gdrive_folder_id: updated.gdriveFolderId });
  }, { body: t.Object({ name: t.Optional(t.String({ minLength: 1 })), is_active: t.Optional(t.Boolean()), gdrive_folder_id: t.Optional(t.String()) }) })

  // Hard-delete is intentionally limited to an empty org. Existing orgs with data should be deactivated instead.
  .delete("/organizations/:id", async ({ params, ctx }: any) => {
    const deleted = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: params.id } });
      if (!org) throw new ApiError("NOT_FOUND", "Organization not found");

      const usage = await getOrgUsage(tx, org.id);
      const usedBy = Object.entries(usage).filter(([, count]) => count > 0).map(([key]) => key);
      if (usedBy.length) {
        throw new ApiError("VALIDATION_ERROR", "ลบองค์กรไม่ได้ เพราะองค์กรยังมีข้อมูลอยู่ ให้ปิดองค์กรแทน");
      }

      await tx.organization.delete({ where: { id: org.id } });
      await audit(tx, {
        action: "delete_org",
        entityType: "organization",
        entityId: org.id,
        actorId: ctx.userId,
        oldValue: { name: org.name },
      });
      return { id: org.id, name: org.name };
    });
    return ok(deleted);
  })

  // Platform-wide defaults + slip storage gateway. The service-account JSON is write-only —
  // it is never returned, only a `gdrive_configured` flag.
  .get("/settings", async () => {
    const s = await getSystemSettings();
    const storage = getStorageConfigStatus(s);
    return ok({
      default_bill_footer: s.defaultBillFooter,
      default_timezone: s.defaultTimezone,
      default_slip_retention_days: s.defaultSlipRetentionDays,
      storage_driver: s.storageDriver,
      gdrive_root_folder_id: s.gdriveRootFolderId,
      gdrive_configured: !!(s.gdriveServiceAccount?.client_email && s.gdriveServiceAccount?.private_key),
      storage_configured: storage.configured,
      storage_missing: storage.missing,
    });
  })
  .patch("/settings", async ({ body, ctx }: any) => {
    const data: any = {};
    if (body?.default_bill_footer !== undefined) data.defaultBillFooter = body.default_bill_footer || null;
    if (body?.default_timezone !== undefined) data.defaultTimezone = body.default_timezone;
    if (body?.default_slip_retention_days !== undefined) data.defaultSlipRetentionDays = body.default_slip_retention_days;
    if (body?.storage_driver !== undefined) data.storageDriver = body.storage_driver;
    if (body?.gdrive_root_folder_id !== undefined) data.gdriveRootFolderId = body.gdrive_root_folder_id || null;
    if (body?.gdrive_service_account !== undefined) {
      const raw = body.gdrive_service_account;
      if (!raw) data.gdriveServiceAccount = null;
      else {
        try {
          const sa = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!sa.client_email || !sa.private_key) throw new Error("missing fields");
          data.gdriveServiceAccount = sa;
        } catch {
          throw new ApiError("VALIDATION_ERROR", "service account ต้องเป็น JSON และมี client_email กับ private_key");
        }
      }
    }
    if (data.storageDriver !== undefined) {
      const current = await getSystemSettings();
      const candidate = {
        ...current,
        storageDriver: data.storageDriver,
        gdriveServiceAccount: data.gdriveServiceAccount ?? current.gdriveServiceAccount,
        gdriveRootFolderId: data.gdriveRootFolderId ?? current.gdriveRootFolderId,
      };
      const storage = getStorageConfigStatus(candidate);
      if (!storage.configured) throw new ApiError("VALIDATION_ERROR", `ตั้งค่า Storage ไม่ครบสำหรับ ${storage.driver}: ${storage.missing.join(", ")}`);
    }
    const row = await updateSystemSettings(data);
    // audit without the secret payload
    await audit(prisma, { action: "update_system_settings", entityType: "system_setting", entityId: "system", actorId: ctx.userId, newValue: { ...data, gdriveServiceAccount: data.gdriveServiceAccount ? "[set]" : data.gdriveServiceAccount } });
    const effective = await getSystemSettings();
    const storage = getStorageConfigStatus(effective);
    return ok({ default_bill_footer: row.defaultBillFooter, default_timezone: row.defaultTimezone, default_slip_retention_days: row.defaultSlipRetentionDays, storage_driver: effective.storageDriver, gdrive_root_folder_id: effective.gdriveRootFolderId, gdrive_configured: !!(effective.gdriveServiceAccount as any)?.client_email, storage_configured: storage.configured, storage_missing: storage.missing });
  }, {
    body: t.Object({
      default_bill_footer: t.Optional(t.String()),
      default_timezone: t.Optional(t.String({ minLength: 1 })),
      default_slip_retention_days: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
      storage_driver: t.Optional(t.Union([t.Literal("local"), t.Literal("gdrive"), t.Literal("s3")])),
      gdrive_root_folder_id: t.Optional(t.String()),
      gdrive_service_account: t.Optional(t.Any()),
    }),
  })

  .get("/google-drive/status", async () => ok(await getGoogleDriveStatus()))
  .post("/google-drive/test", async () => ok(await getGoogleDriveStatus()))
  .get("/google-drive/files", async ({ query }: any) => {
    try {
      return ok(await listGoogleDriveFolder(query.folder_id));
    } catch {
      throw new ApiError("VALIDATION_ERROR", "ยังไม่สามารถอ่านไฟล์จาก Google Drive ได้ ตรวจสอบการตั้งค่าและสิทธิ์โฟลเดอร์");
    }
  }, { query: t.Object({ folder_id: t.Optional(t.String()) }) })

  .get("/storage/status", async () => ok(await getS3StorageStatus()))
  .post("/storage/test", async () => ok(await getS3StorageStatus()))
  .get("/storage/usage", async () => ok(await getR2StorageUsage()))

  // Read-only system status / health (no secrets — only whether things are configured).
  .get("/system-info", async () => {
    let dbOk = true;
    try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
    const [orgs, users] = await Promise.all([prisma.organization.count(), prisma.adminUser.count()]);
    const s = await getSystemSettings();
    return ok({
      version: "0.1.0",
      runtime: `Bun ${Bun.version}`,
      node_env: process.env.NODE_ENV ?? "development",
      timezone: env.tz,
      uptime_sec: Math.round(process.uptime()),
      db_ok: dbOk,
      orgs,
      users,
      ocr: {
        provider: env.ocrProvider,
        model: env.ocrModel,
        configured: !!env.ocrApiKey,         // never expose the key itself
        guards_enabled: env.ocrGuardsEnabled,
        rate_max: env.ocrRateMax,
        rate_window_sec: env.ocrRateWindowSec,
      },
      auto_approve: env.autoApprove,
      slip_retention_days_env_default: env.slipRetentionDays,
      storage_driver: s.storageDriver,
      storage_gdrive_configured: !!(s.gdriveServiceAccount?.client_email && s.gdriveRootFolderId),
      storage_configured: getStorageConfigStatus(s).configured,
      storage_missing: getStorageConfigStatus(s).missing,
    });
  })

  .get("/admin-users", async () => ok((await prisma.adminUser.findMany({ include: withOrg, orderBy: { createdAt: "asc" } })).map(userView)))

  // Create a user (username/password) and put them in an org (existing org_id or new org_name).
  .post("/admin-users", async ({ body, ctx }: any) => {
    const { username, password, display_name, is_platform_admin, org_id, org_name } = body ?? {};
    if (!username || !password) throw new ApiError("VALIDATION_ERROR", "username and password are required");
    if (await prisma.adminUser.findUnique({ where: { username } }))
      throw new ApiError("VALIDATION_ERROR", "username already exists");
    const u = await prisma.adminUser.create({
      data: { username, passwordHash: await Bun.password.hash(password), displayName: display_name, isPlatformAdmin: !!is_platform_admin, isActive: true },
    });
    if (!is_platform_admin) await setUserOrg(u.id, { org_id, org_name });
    await audit(prisma, { action: "create_admin_user", entityType: "admin_user", entityId: u.id, actorId: ctx.userId, newValue: { username, isPlatformAdmin: u.isPlatformAdmin } });
    const full = await prisma.adminUser.findUnique({ where: { id: u.id }, include: withOrg });
    return ok(userView(full));
  })

  // Reset password / activate-deactivate / toggle platform / move org.
  .patch("/admin-users/:id", async ({ params, body, ctx }: any) => {
    const u = await prisma.adminUser.findUnique({ where: { id: params.id } });
    if (!u) throw new ApiError("NOT_FOUND", "User not found");
    const data: any = {};
    if (body?.display_name !== undefined) data.displayName = body.display_name;
    if (body?.is_active !== undefined) data.isActive = !!body.is_active;
    if (body?.is_platform_admin !== undefined) data.isPlatformAdmin = !!body.is_platform_admin;
    if (body?.password) data.passwordHash = await Bun.password.hash(body.password);

    // Keep at least one active super admin.
    const losing = u.isPlatformAdmin && u.isActive && (data.isPlatformAdmin === false || data.isActive === false);
    if (losing) {
      const admins = await prisma.adminUser.count({ where: { isPlatformAdmin: true, isActive: true } });
      if (admins <= 1) throw new ApiError("VALIDATION_ERROR", "ต้องมี super admin ที่ใช้งานได้อย่างน้อย 1 คน");
    }
    await prisma.adminUser.update({ where: { id: params.id }, data });
    if (body?.org_id !== undefined || body?.org_name !== undefined)
      await setUserOrg(params.id, { org_id: body.org_id, org_name: body.org_name });
    await audit(prisma, { action: "update_admin_user", entityType: "admin_user", entityId: u.id, actorId: ctx.userId, newValue: data });
    const full = await prisma.adminUser.findUnique({ where: { id: params.id }, include: withOrg });
    return ok(userView(full));
  });
