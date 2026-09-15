import type { PrismaClient } from "@prisma/client";
import { ApiError } from "./response";

export const ADMIN_PERMISSIONS = [
  "dashboard",
  "customers",
  "banks",
  "plans",
  "submissions",
  "senders",
  "groups",
  "reports",
  "oa",
  "chat",
  "logs",
  "settings",
  "message-settings",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
export type ApprovalStatus = "pending" | "approved";

const permissionSet = new Set<string>(ADMIN_PERMISSIONS);

export function normalizePermissions(value: unknown): AdminPermission[] {
  if (value == null) return [...ADMIN_PERMISSIONS];
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is AdminPermission => typeof item === "string" && permissionSet.has(item)))];
}

export function hasApprovedPermissions(value: unknown) {
  return value == null || normalizePermissions(value).length > 0;
}

export function invalidPermissions(value: unknown) {
  if (!Array.isArray(value)) return true;
  return value.some((item) => typeof item !== "string" || !permissionSet.has(item));
}

type AccessDb = Pick<PrismaClient, "membership">;

export async function getAdminAccess(db: AccessDb, adminUserId: string, orgId?: string | null) {
  const memberships = await db.membership.findMany({
    where: { adminUserId },
    include: { organization: { select: { id: true, name: true, isActive: true } } },
    orderBy: { createdAt: "asc" },
  });
  const active = memberships.filter((membership: any) => membership.organization.isActive);
  const approvedActive = active.find((item: any) => hasApprovedPermissions(item.permissions));
  const membership = orgId ? memberships.find((item: any) => item.orgId === orgId) ?? null : approvedActive ?? active[0] ?? memberships[0] ?? null;
  const selectedApproved = !!membership && membership.organization.isActive && hasApprovedPermissions(membership.permissions);
  return {
    membership,
    permissions: selectedApproved ? normalizePermissions(membership.permissions) : [],
    approvalStatus: selectedApproved ? "approved" as const : "pending" as const,
    hasApprovedMembership: active.some((item: any) => hasApprovedPermissions(item.permissions)),
  };
}

export function requirePermission(ctx: { isPlatformAdmin: boolean; permissions: AdminPermission[] }, permission: AdminPermission) {
  if (!ctx.isPlatformAdmin && !ctx.permissions.includes(permission)) throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์เข้าใช้งานเมนูนี้");
}

export function requireAnyPermission(ctx: { isPlatformAdmin: boolean; permissions: AdminPermission[] }, permissions: AdminPermission[]) {
  if (!ctx.isPlatformAdmin && !permissions.some((permission) => ctx.permissions.includes(permission)))
    throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์เข้าใช้งานเมนูนี้");
}

export function requiredPermissions(method: string, requestUrl: string): AdminPermission[] | null {
  const path = new URL(requestUrl).pathname;
  const read = method === "GET";
  if (path.startsWith("/api/customers")) {
    if (read && /\/bill-plans$/.test(path)) return ["customers", "plans"];
    if (read && (/^\/api\/customers$/.test(path) || /\/detail$/.test(path))) return ["customers", "plans", "dashboard"];
    return ["customers"];
  }
  if (path.startsWith("/api/bank-accounts")) return read ? ["banks", "plans", "dashboard"] : ["banks"];
  if (path.startsWith("/api/bill-plans")) return ["plans"];
  if (path.startsWith("/api/installments")) return read ? ["dashboard", "plans", "reports"] : ["dashboard", "plans"];
  if (path.startsWith("/api/admin/payment-submissions")) return ["submissions"];
  if (path.startsWith("/api/line-oa-accounts")) return read ? ["oa", "customers", "dashboard"] : ["oa"];
  if (path.startsWith("/api/senders")) return ["senders"];
  if (path.startsWith("/api/groups")) return ["groups"];
  if (path.startsWith("/api/reports")) return path.endsWith("/summary") || path.endsWith("/dashboard-charts") ? ["dashboard", "reports"] : ["reports"];
  if (path.startsWith("/api/audit-logs") || path.startsWith("/api/message-logs")) return ["logs"];
  if (path.startsWith("/api/conversations") || path.startsWith("/api/conversation-messages")) return ["chat"];
  if (path.startsWith("/api/messages/")) return ["customers", "chat"];
  if (path === "/api/settings" || path === "/api/settings/") return read ? ["settings", "message-settings"] : ["settings", "message-settings"];
  return null;
}
