import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { pushMessage } from "../lib/line";
import { oaForSubmission } from "../services/oa";

// Org-scoped audit log + resend of a failed LINE message.
export const logRoutes = new Elysia()
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/api/audit-logs", async ({ query, ctx }: any) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 30));
    const where = { orgId: ctx.orgId };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.count({ where }),
    ]);
    return ok({ items, total, page, limit });
  })

  .post("/api/messages/:id/resend", async ({ params, ctx }: any) => {
    const log = await prisma.messageLog.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!log) throw new ApiError("NOT_FOUND", "Message not found");
    if (!log.lineUserId) throw new ApiError("VALIDATION_ERROR", "No LINE recipient");
    const oa = await oaForSubmission(prisma, log.lineOaId);
    const r = await pushMessage(log.lineUserId, log.messageText ?? "", oa.accessToken);
    await prisma.messageLog.update({
      where: { id: log.id },
      data: { status: r.status, errorMessage: r.error ?? null },
    });
    if (r.status === "failed") throw new ApiError("LINE_PUSH_FAILED", r.error ?? "resend failed");
    return ok({ status: r.status });
  });
