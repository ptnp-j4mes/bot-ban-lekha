import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";

// Per-org settings (name, timezone, bill footer). Any member of the org can view/edit.
export const settingsRoutes = new Elysia({ prefix: "/api/settings" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) => {
    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId } });
    if (!org) throw new ApiError("NOT_FOUND", "Organization not found");
    return ok({ id: org.id, name: org.name, timezone: org.timezone, bill_footer: org.billFooter });
  })

  .patch(
    "/",
    async ({ body, ctx }: any) => {
      const data: any = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.timezone !== undefined) data.timezone = body.timezone;
      if (body.bill_footer !== undefined) data.billFooter = body.bill_footer || null;
      const org = await prisma.organization.update({ where: { id: ctx.orgId }, data });
      await audit(prisma, { action: "update_settings", entityType: "organization", entityId: org.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: data });
      return ok({ id: org.id, name: org.name, timezone: org.timezone, bill_footer: org.billFooter });
    },
    { body: t.Object({ name: t.Optional(t.String()), timezone: t.Optional(t.String()), bill_footer: t.Optional(t.String()) }) }
  );
