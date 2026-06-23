import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";

// Slip senders registry (who posts slips in groups). Member can view + rename.
export const senderRoutes = new Elysia({ prefix: "/api/senders" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) => {
    const senders = await prisma.lineSender.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } });
    const counts = await prisma.paymentSubmission.groupBy({
      by: ["lineUserId"],
      where: { orgId: ctx.orgId, lineGroupId: { not: null } },
      _count: { _all: true },
    });
    const map = new Map(counts.map((c) => [c.lineUserId, c._count._all]));
    return ok(senders.map((s) => ({ id: s.id, line_user_id: s.lineUserId, name: s.name, slip_count: map.get(s.lineUserId) ?? 0 })));
  })

  .patch(
    "/:id",
    async ({ params, body, ctx }: any) => {
      const s = await prisma.lineSender.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
      if (!s) throw new ApiError("NOT_FOUND", "Sender not found");
      const updated = await prisma.lineSender.update({ where: { id: params.id }, data: { name: body.name } });
      // Keep slip records in sync so the tracked name shows everywhere.
      await prisma.paymentSubmission.updateMany({ where: { orgId: ctx.orgId, lineUserId: s.lineUserId }, data: { senderName: body.name } });
      await audit(prisma, { action: "rename_sender", entityType: "line_sender", entityId: s.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: { name: s.name }, newValue: { name: body.name } });
      return ok({ id: updated.id, name: updated.name });
    },
    { body: t.Object({ name: t.String({ minLength: 1 }) }) }
  );
