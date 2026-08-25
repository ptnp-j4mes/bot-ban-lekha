import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { getMessageContent, pushMessage } from "../lib/line";
import { oaForSubmission } from "../services/oa";
import { detectImageMime } from "../services/ocr";

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

  .get("/api/message-logs", async ({ query, ctx }: any) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 30));
    const where = { orgId: ctx.orgId, direction: "inbound" };
    const [items, total] = await Promise.all([
      prisma.messageLog.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { sentAt: "desc" } }),
      prisma.messageLog.count({ where }),
    ]);
    return ok({ items, total, page, limit });
  })

  // Chatclone read model: message_logs already contains both inbound and outbound
  // messages, so the admin can browse a conversation without a second transcript table.
  .get("/api/conversations", async ({ query, ctx }: any) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Number(query.limit ?? 30));
    const search = String(query.search ?? "").trim();
    const where: any = {
      orgId: ctx.orgId,
      lineUserId: { not: null },
    };
    if (search) {
      where.OR = [
        { lineUserId: { contains: search, mode: "insensitive" } },
        { sourceName: { contains: search, mode: "insensitive" } },
        { messageText: { contains: search, mode: "insensitive" } },
        { customer: { is: { displayName: { contains: search, mode: "insensitive" }, orgId: ctx.orgId } } },
      ];
    }

    const grouped = await prisma.messageLog.groupBy({
      by: ["lineUserId"],
      where,
      _count: { _all: true },
      _max: { sentAt: true },
      orderBy: { _max: { sentAt: "desc" } },
    });
    const total = grouped.length;
    const pageGroups = grouped.slice((page - 1) * limit, page * limit);
    const items = await Promise.all(pageGroups.map(async (group: any) => {
      const lineUserId = group.lineUserId as string;
      const latest = await prisma.messageLog.findFirst({
        where: { ...where, lineUserId },
        orderBy: { sentAt: "desc" },
        select: {
          id: true,
          lineUserId: true,
          direction: true,
          messageType: true,
          messageText: true,
          sourceName: true,
          sourceType: true,
          status: true,
          sentAt: true,
          customer: { select: { id: true, customerCode: true, displayName: true } },
        },
      });
      return {
        key: lineUserId,
        lineUserId,
        title: latest?.customer?.displayName || latest?.sourceName || lineUserId,
        customer: latest?.customer ?? null,
        messageCount: group._count._all,
        lastMessage: latest?.messageText ?? null,
        lastDirection: latest?.direction ?? null,
        lastMessageType: latest?.messageType ?? null,
        lastStatus: latest?.status ?? null,
        lastMessageAt: latest?.sentAt ?? group._max.sentAt,
      };
    }));
    return ok({ items, total, page, limit });
  })

  .get("/api/conversations/:lineUserId", async ({ params, ctx }: any) => {
    let lineUserId = String(params.lineUserId ?? "");
    try { lineUserId = decodeURIComponent(lineUserId); } catch {}
    if (!lineUserId) throw new ApiError("VALIDATION_ERROR", "lineUserId is required");
    const messages = await prisma.messageLog.findMany({
      where: { orgId: ctx.orgId, lineUserId },
      orderBy: { sentAt: "asc" },
      take: 300,
      select: {
        id: true,
        lineUserId: true,
        direction: true,
        sourceType: true,
        sourceName: true,
        messageType: true,
        messageText: true,
        status: true,
        errorMessage: true,
        lineMessageId: true,
        sentAt: true,
        customer: { select: { id: true, customerCode: true, displayName: true } },
      },
    });
    if (!messages.length) throw new ApiError("NOT_FOUND", "Conversation not found");
    const latest = messages[messages.length - 1];
    return ok({
      conversation: {
        key: lineUserId,
        lineUserId,
        title: latest.customer?.displayName || latest.sourceName || lineUserId,
        customer: latest.customer ?? null,
        messageCount: messages.length,
      },
      messages,
    });
  })

  // Fetch inbound LINE images only after the admin explicitly asks to view them.
  // The access token stays on the backend and the response remains org-scoped.
  .get("/api/conversation-messages/:id/image", async ({ params, ctx }: any) => {
    const log = await prisma.messageLog.findFirst({
      where: { id: params.id, orgId: ctx.orgId, direction: "inbound", messageType: "inbound_image" },
      select: { lineMessageId: true, lineOaId: true },
    });
    if (!log?.lineMessageId) throw new ApiError("NOT_FOUND", "Image message not found");

    const oa = await oaForSubmission(prisma, log.lineOaId);
    const image = await getMessageContent(log.lineMessageId, oa.accessToken);
    const mime = detectImageMime(image);
    if (!mime) throw new ApiError("NOT_FOUND", "Image content is unavailable");
    return new Response(image, {
      headers: {
        "content-type": mime,
        "cache-control": "private, max-age=300",
      },
    });
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
