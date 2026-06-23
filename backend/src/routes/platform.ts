import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorizePlatform } from "../lib/auth";
import { audit } from "../services/audit";

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
    const org = await prisma.organization.create({ data: { name: opts.org_name } });
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
