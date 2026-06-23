import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";

// LINE groups the bot collects slips from. Member can view + rename.
export const groupRoutes = new Elysia({ prefix: "/api/groups" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) => {
    const groups = await prisma.lineGroup.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } });
    const counts = await prisma.paymentSubmission.groupBy({
      by: ["lineGroupId"],
      where: { orgId: ctx.orgId, lineGroupId: { not: null } },
      _count: { _all: true },
    });
    const map = new Map(counts.map((c) => [c.lineGroupId, c._count._all]));
    return ok(groups.map((g) => ({ id: g.id, line_group_id: g.lineGroupId, name: g.name, slip_count: map.get(g.lineGroupId) ?? 0 })));
  })

  .patch(
    "/:id",
    async ({ params, body, ctx }: any) => {
      const g = await prisma.lineGroup.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
      if (!g) throw new ApiError("NOT_FOUND", "Group not found");
      const updated = await prisma.lineGroup.update({ where: { id: params.id }, data: { name: body.name } });
      await audit(prisma, { action: "rename_group", entityType: "line_group", entityId: g.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: { name: g.name }, newValue: { name: body.name } });
      return ok({ id: updated.id, name: updated.name });
    },
    { body: t.Object({ name: t.String({ minLength: 1 }) }) }
  );
