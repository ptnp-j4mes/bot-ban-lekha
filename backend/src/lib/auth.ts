import { env } from "../env";
import { prisma } from "./prisma";
import { verifyJwt } from "./jwt";
import { ApiError } from "./response";

// Two roles only: super_admin (isPlatformAdmin) and user (member of an org).
// A user has full access within their own org; no viewer/admin/owner tiers.
export type AuthContext = {
  userId: string;
  isPlatformAdmin: boolean;
  orgId: string | null; // org being acted on (from x-org-id)
  name?: string | null;
};

type Headers = Record<string, string | undefined>;
const bearer = (h: string | undefined) => (h?.startsWith("Bearer ") ? h.slice(7) : undefined);

// Resolve the caller + which org they're acting on (x-org-id). Super admins (and the
// break-glass API key) may act on any org; a user may act only on an org they belong to.
export async function authContext(headers: Headers): Promise<AuthContext> {
  const orgId = headers["x-org-id"] || null;

  if (headers["x-api-key"] && headers["x-api-key"] === env.adminApiKey) {
    return { userId: "apikey", isPlatformAdmin: true, orgId, name: "API Key" };
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
  if (!user.isActive) throw new ApiError("FORBIDDEN", "บัญชีถูกปิดใช้งาน");

  // A non-platform user may only act on an org they are a member of.
  if (orgId && !user.isPlatformAdmin) {
    const member = await prisma.membership.findUnique({
      where: { orgId_adminUserId: { orgId, adminUserId: user.id } },
    });
    if (!member) throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์เข้าถึงองค์กรนี้");
  }
  return { userId: user.id, isPlatformAdmin: user.isPlatformAdmin, orgId, name: user.displayName };
}

// Guard for org-scoped routes: requires x-org-id + access to that org (member or platform).
// No role tiers — any member has full access within the org.
export async function authorize(headers: Headers, _method?: string): Promise<AuthContext> {
  const ctx = await authContext(headers);
  if (!ctx.orgId) throw new ApiError("VALIDATION_ERROR", "x-org-id header is required");
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
