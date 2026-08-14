import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";

const view = (org: any) => ({
  id: org.id,
  name: org.name,
  timezone: org.timezone,
  bill_footer: org.billFooter,
  reminder_hour: org.reminderHour,
  deadline_hour: org.deadlineHour,
  reminder_text: org.reminderText,
  slip_retention_days: org.slipRetentionDays,
  auto_approve_enabled: org.autoApproveEnabled,
});

// Per-org settings (name, timezone, bill footer, reminder schedule/message). Any member can view/edit.
export const settingsRoutes = new Elysia({ prefix: "/api/settings" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) => {
    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId } });
    if (!org) throw new ApiError("NOT_FOUND", "Organization not found");
    return ok(view(org));
  })

  .patch(
    "/",
    async ({ body, ctx }: any) => {
      const data: any = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.timezone !== undefined) data.timezone = body.timezone;
      if (body.bill_footer !== undefined) data.billFooter = body.bill_footer || null;
      if (body.reminder_hour !== undefined) data.reminderHour = body.reminder_hour;
      if (body.deadline_hour !== undefined) data.deadlineHour = body.deadline_hour;
      if (body.reminder_text !== undefined) data.reminderText = body.reminder_text || null;
      if (body.slip_retention_days !== undefined) data.slipRetentionDays = body.slip_retention_days;
      if (body.auto_approve_enabled !== undefined) data.autoApproveEnabled = body.auto_approve_enabled;
      const org = await prisma.organization.update({ where: { id: ctx.orgId }, data });
      await audit(prisma, { action: "update_settings", entityType: "organization", entityId: org.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: data });
      return ok(view(org));
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        bill_footer: t.Optional(t.String()),
        reminder_hour: t.Optional(t.Integer({ minimum: 0, maximum: 23 })),
        deadline_hour: t.Optional(t.Integer({ minimum: 0, maximum: 23 })),
        reminder_text: t.Optional(t.String()),
        slip_retention_days: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
        auto_approve_enabled: t.Optional(t.Boolean()),
      }),
    }
  );
