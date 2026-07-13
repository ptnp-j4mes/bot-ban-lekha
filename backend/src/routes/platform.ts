import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { ok, ApiError } from "../lib/response";
import { authorizePlatform } from "../lib/auth";
import { audit } from "../services/audit";
import { getSystemSettings, updateSystemSettings } from "../services/systemSettings";

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
    const updated = await prisma.organization.update({ where: { id: params.id }, data });
    await audit(prisma, { action: "update_org", entityType: "organization", entityId: org.id, orgId: org.id, actorId: ctx.userId, newValue: data });
    return ok({ id: updated.id, name: updated.name, is_active: updated.isActive });
  }, { body: t.Object({ name: t.Optional(t.String({ minLength: 1 })), is_active: t.Optional(t.Boolean()) }) })

  // Platform-wide defaults + slip storage gateway. The service-account JSON is write-only —
  // it is never returned, only a `gdrive_configured` flag.
  .get("/settings", async () => {
    const s = await getSystemSettings();
    return ok({
      default_bill_footer: s.defaultBillFooter,
      default_timezone: s.defaultTimezone,
      storage_driver: s.storageDriver,
      gdrive_root_folder_id: s.gdriveRootFolderId,
      gdrive_configured: !!(s.gdriveServiceAccount?.client_email && s.gdriveServiceAccount?.private_key),
    });
  })
  .patch("/settings", async ({ body, ctx }: any) => {
    const data: any = {};
    if (body?.default_bill_footer !== undefined) data.defaultBillFooter = body.default_bill_footer || null;
    if (body?.default_timezone !== undefined) data.defaultTimezone = body.default_timezone;
    if (body?.storage_driver !== undefined) data.storageDriver = body.storage_driver;
    if (body?.gdrive_root_folder_id !== undefined) data.gdriveRootFolderId = body.gdrive_root_folder_id || null;
    if (body?.gdrive_service_account !== undefined) {
      const raw = body.gdrive_service_account;
      if (!raw) data.gdriveServiceAccount = null;
      else {
        const sa = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!sa.client_email || !sa.private_key) throw new ApiError("VALIDATION_ERROR", "service account ต้องมี client_email และ private_key");
        data.gdriveServiceAccount = sa;
      }
    }
    if (data.storageDriver === "gdrive") {
      const s = await getSystemSettings();
      const sa = data.gdriveServiceAccount ?? s.gdriveServiceAccount;
      const root = data.gdriveRootFolderId ?? s.gdriveRootFolderId;
      if (!(sa?.client_email && sa?.private_key && root)) throw new ApiError("VALIDATION_ERROR", "ต้องตั้ง service account + root folder ก่อนเปิดใช้ Google Drive");
    }
    const row = await updateSystemSettings(data);
    // audit without the secret payload
    await audit(prisma, { action: "update_system_settings", entityType: "system_setting", entityId: "system", actorId: ctx.userId, newValue: { ...data, gdriveServiceAccount: data.gdriveServiceAccount ? "[set]" : data.gdriveServiceAccount } });
    return ok({ default_bill_footer: row.defaultBillFooter, default_timezone: row.defaultTimezone, storage_driver: row.storageDriver, gdrive_root_folder_id: row.gdriveRootFolderId, gdrive_configured: !!(row.gdriveServiceAccount as any)?.client_email });
  }, {
    body: t.Object({
      default_bill_footer: t.Optional(t.String()),
      default_timezone: t.Optional(t.String({ minLength: 1 })),
      storage_driver: t.Optional(t.Union([t.Literal("local"), t.Literal("gdrive")])),
      gdrive_root_folder_id: t.Optional(t.String()),
      gdrive_service_account: t.Optional(t.Any()),
    }),
  })

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
        rate_max: env.ocrRateMax,
        rate_window_sec: env.ocrRateWindowSec,
      },
      storage_driver: s.storageDriver,
      storage_gdrive_configured: !!(s.gdriveServiceAccount?.client_email && s.gdriveRootFolderId),
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
