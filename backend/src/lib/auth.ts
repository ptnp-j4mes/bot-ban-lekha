import { env } from "../env";
import { prisma } from "./prisma";
import { verifyJwt, signJwt } from "./jwt";
import { ApiError } from "./response";
import { ADMIN_PERMISSIONS, getAdminAccess, requireAnyPermission, requiredPermissions, type AdminPermission, type ApprovalStatus } from "./permissions";

// Two roles only: super_admin (isPlatformAdmin) and user (member of an org).
// A user has full access within their own org; no viewer/admin/owner tiers.
export type AuthContext = {
  userId: string;
  isPlatformAdmin: boolean;
  orgId: string | null; // org being acted on (from x-org-id)
  name?: string | null;
  approvalStatus: ApprovalStatus;
  permissions: AdminPermission[];
};

type Headers = Record<string, string | undefined>;
const bearer = (h: string | undefined) => (h?.startsWith("Bearer ") ? h.slice(7) : undefined);

// Resolve the caller + which org they're acting on (x-org-id). Super admins (and the
// break-glass API key) may act on any org; a user may act only on an org they belong to.
export async function authContext(headers: Headers, options: { allowPending?: boolean; ignoreOrg?: boolean } = {}): Promise<AuthContext> {
  const orgId = options.ignoreOrg ? null : headers["x-org-id"] || null;

  if (headers["x-api-key"] && headers["x-api-key"] === env.adminApiKey) {
    return { userId: "apikey", isPlatformAdmin: true, orgId, name: "API Key", approvalStatus: "approved", permissions: [...ADMIN_PERMISSIONS] };
  }

  const token = bearer(headers["authorization"]);
  if (!token) throw new ApiError("UNAUTHORIZED", "Authentication required");

  let payload: any;
  try {
    payload = verifyJwt(token, env.jwtSecret);
  } catch {
    throw new ApiError("UNAUTHORIZED", "Invalid or expired token");
  }
  const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
  if (!user) throw new ApiError("UNAUTHORIZED", "Account not found");
  if (!user.isActive) {
    if (!options.allowPending) throw new ApiError("PENDING_APPROVAL", "รออนุมัติสิทธิ์เข้าใช้งาน");
    return { userId: user.id, isPlatformAdmin: user.isPlatformAdmin, orgId, name: user.displayName, approvalStatus: "pending", permissions: [] };
  }

  const access = user.isPlatformAdmin ? null : await getAdminAccess(prisma, user.id, orgId);
  const approvalStatus = user.isPlatformAdmin ? "approved" : access!.approvalStatus;
  const permissions = user.isPlatformAdmin ? [...ADMIN_PERMISSIONS] : access!.permissions;
  if (!options.allowPending && !user.isPlatformAdmin && !access!.hasApprovedMembership)
    throw new ApiError("PENDING_APPROVAL", "รออนุมัติสิทธิ์เข้าใช้งาน");

  // A non-platform user may only act on an org they are a member of.
  if (orgId && !user.isPlatformAdmin) {
    if (!access!.membership || !access!.membership.organization.isActive) {
      if (!access!.hasApprovedMembership) throw new ApiError("PENDING_APPROVAL", "รออนุมัติสิทธิ์เข้าใช้งาน");
      throw new ApiError("FORBIDDEN", "องค์กรถูกปิดใช้งานหรือไม่มีสิทธิ์เข้าถึง");
    }
    if (access!.approvalStatus === "pending") throw new ApiError("PENDING_APPROVAL", "รออนุมัติสิทธิ์เข้าใช้งาน");
  }
  return { userId: user.id, isPlatformAdmin: user.isPlatformAdmin, orgId, name: user.displayName, approvalStatus, permissions };
}

// Guard for org-scoped routes: requires x-org-id + access to that org (member or platform).
// No role tiers — any member has full access within the org.
export async function authorize(headers: Headers, _method?: string, requestUrl?: string): Promise<AuthContext> {
  const ctx = await authContext(headers);
  if (!ctx.orgId) throw new ApiError("VALIDATION_ERROR", "x-org-id header is required");
  if (requestUrl) requireAnyPermission(ctx, requiredPermissions(_method ?? "GET", requestUrl) ?? []);
  return ctx;
}

// Guard for super-admin-only routes (user management / cross-tenant).
export async function authorizePlatform(headers: Headers): Promise<AuthContext> {
  const ctx = await authContext(headers);
  if (!ctx.isPlatformAdmin) throw new ApiError("FORBIDDEN", "ต้องเป็น super admin");
  return ctx;
}

export function requireJob(headers: Headers) {
  const key = headers["x-job-key"] ?? bearer(headers["authorization"]);
  if (key !== env.jobApiKey) throw new ApiError("UNAUTHORIZED", "Invalid job API key");
}

// Customer self-service (LIFF) session: one linked customer, nothing else. Short-lived and
// distinct from the admin JWT (`typ: "liff"`) so the two token kinds can never be confused.
export type LiffContext = { customerId: string; orgId: string; lineOaId: string; lineUserId: string };
export const liffRegistrationRequiredMessage = "บัญชี LINE นี้ยังรอลงทะเบียนเป็นลูกค้า กรุณาติดต่อแอดมิน";

export function signLiffSession(ctx: LiffContext): string {
  return signJwt({ sub: ctx.customerId, typ: "liff", orgId: ctx.orgId, lineOaId: ctx.lineOaId, lineUserId: ctx.lineUserId }, env.jwtSecret, 12 * 3600);
}

// Guard for /api/liff/* routes. Re-checks the customer row on every call (not just the JWT
// claims) so a since-unlinked or deactivated customer immediately loses access.
export async function authorizeLiff(headers: Headers): Promise<LiffContext> {
  const token = bearer(headers["authorization"]);
  if (!token) throw new ApiError("UNAUTHORIZED", "Authentication required");
  let payload: any;
  try {
    payload = verifyJwt(token, env.jwtSecret);
  } catch {
    throw new ApiError("UNAUTHORIZED", "Invalid or expired session");
  }
  if (payload.typ !== "liff") throw new ApiError("UNAUTHORIZED", "Invalid session");
  const customer = await prisma.customer.findFirst({
    where: { id: payload.sub, orgId: payload.orgId, lineUserId: payload.lineUserId, customerType: "customer", status: "active", organization: { isActive: true } },
  });
  if (!customer) throw new ApiError("NOT_FOUND", liffRegistrationRequiredMessage);
  return { customerId: customer.id, orgId: customer.orgId, lineOaId: payload.lineOaId, lineUserId: payload.lineUserId };
}
