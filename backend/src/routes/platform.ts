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

  // Platform-wide defaults.
  .get("/settings", async () => {
    const s = await getSystemSettings();
    return ok({ default_bill_footer: s.defaultBillFooter, default_timezone: s.defaultTimezone, default_slip_retention_days: s.defaultSlipRetentionDays });
  })
  .patch("/settings", async ({ body, ctx }: any) => {
    const data: any = {};
    if (body?.default_bill_footer !== undefined) data.defaultBillFooter = body.default_bill_footer || null;
    if (body?.default_timezone !== undefined) data.defaultTimezone = body.default_timezone;
    if (body?.default_slip_retention_days !== undefined) data.defaultSlipRetentionDays = body.default_slip_retention_days;
    const row = await updateSystemSettings(data);
    await audit(prisma, { action: "update_system_settings", entityType: "system_setting", entityId: "system", actorId: ctx.userId, newValue: data });
    return ok({ default_bill_footer: row.defaultBillFooter, default_timezone: row.defaultTimezone, default_slip_retention_days: row.defaultSlipRetentionDays });
  }, { body: t.Object({ default_bill_footer: t.Optional(t.String()), default_timezone: t.Optional(t.String({ minLength: 1 })), default_slip_retention_days: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])) }) })

  // Read-only system status / health (no secrets — only whether things are configured).
  .get("/system-info", async () => {
    let dbOk = true;
    try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
    const [orgs, users] = await Promise.all([prisma.organization.count(), prisma.adminUser.count()]);
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
      auto_approve: env.autoApprove,
      storage_driver: env.storageDriver,
      slip_retention_days_default: env.slipRetentionDaysDefault,
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
