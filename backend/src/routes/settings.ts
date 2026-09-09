import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";
import { MESSAGE_TEMPLATE_KEYS, mergeMessageTemplateEnabled, mergeMessageTemplates, normalizeCustomMessageTemplates } from "../services/messages";

const view = (org: any) => ({
  id: org.id,
  name: org.name,
  timezone: org.timezone,
  bill_footer: org.billFooter,
  reminder_hour: org.reminderHour,
  deadline_hour: org.deadlineHour,
  reminder_text: org.reminderText,
  slip_retention_days: org.slipRetentionDays,
  auto_match_enabled: org.autoMatchEnabled,
  auto_approve_enabled: org.autoApproveEnabled,
  message_templates: {
    ...mergeMessageTemplates(org.messageTemplates),
    enabled: mergeMessageTemplateEnabled((org.messageTemplates as any)?.enabled),
    custom_messages: normalizeCustomMessageTemplates((org.messageTemplates as any)?.custom_messages),
  },
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
      if (body.auto_match_enabled !== undefined) data.autoMatchEnabled = body.auto_match_enabled;
      if (body.auto_approve_enabled !== undefined) data.autoApproveEnabled = body.auto_approve_enabled;
      if (body.message_templates !== undefined) {
        if (!body.message_templates || typeof body.message_templates !== "object" || Array.isArray(body.message_templates))
          throw new ApiError("VALIDATION_ERROR", "message_templates ต้องเป็น object");
        const templates: Record<string, string> = {};
        for (const key of MESSAGE_TEMPLATE_KEYS) {
          const value = body.message_templates[key];
          if (value !== undefined) {
            if (typeof value !== "string" || value.length > 4000)
              throw new ApiError("VALIDATION_ERROR", `ข้อความ ${key} ต้องเป็นข้อความไม่เกิน 4000 ตัวอักษร`);
            if (value.trim()) templates[key] = value;
          }
        }
        const rawEnabled = body.message_templates.enabled;
        if (rawEnabled !== undefined && (!rawEnabled || typeof rawEnabled !== "object" || Array.isArray(rawEnabled)))
          throw new ApiError("VALIDATION_ERROR", "enabled ต้องเป็น object");
        if (rawEnabled !== undefined) {
          for (const key of MESSAGE_TEMPLATE_KEYS) {
            if (rawEnabled[key] !== undefined && typeof rawEnabled[key] !== "boolean")
              throw new ApiError("VALIDATION_ERROR", `สถานะ ${key} ต้องเป็น boolean`);
          }
        }
        const rawCustom = body.message_templates.custom_messages;
        if (rawCustom !== undefined) {
          if (!Array.isArray(rawCustom) || rawCustom.length > 100)
            throw new ApiError("VALIDATION_ERROR", "custom_messages ต้องเป็น array ไม่เกิน 100 รายการ");
          for (const item of rawCustom) {
            if (!item || typeof item !== "object" || typeof item.name !== "string" || typeof item.trigger !== "string" || typeof item.text !== "string")
              throw new ApiError("VALIDATION_ERROR", "custom message ต้องมี name, trigger และ text");
            if (item.name.length > 120 || item.trigger.length > 120 || item.text.length > 4000)
              throw new ApiError("VALIDATION_ERROR", "custom message มีความยาวเกินกำหนด");
          }
        }
        const currentOrg = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { messageTemplates: true } });
        const currentRaw = currentOrg?.messageTemplates as any;
        const currentCustom = normalizeCustomMessageTemplates(currentRaw?.custom_messages);
        const currentEnabled = mergeMessageTemplateEnabled(currentRaw?.enabled);
        const storedTemplates: Record<string, string> = {};
        for (const key of MESSAGE_TEMPLATE_KEYS) {
          if (Object.prototype.hasOwnProperty.call(body.message_templates, key)) {
            if (templates[key] !== undefined) storedTemplates[key] = templates[key];
          } else if (typeof currentRaw?.[key] === "string" && currentRaw[key].trim()) {
            storedTemplates[key] = currentRaw[key];
          }
        }
        data.messageTemplates = {
          ...storedTemplates,
          enabled: Object.fromEntries(MESSAGE_TEMPLATE_KEYS.map((key) => [
            key,
            rawEnabled?.[key] === undefined ? currentEnabled[key] : rawEnabled[key],
          ])),
          custom_messages: normalizeCustomMessageTemplates(rawCustom === undefined ? currentCustom : rawCustom),
        };
      }
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
        auto_match_enabled: t.Optional(t.Boolean()),
        auto_approve_enabled: t.Optional(t.Boolean()),
        message_templates: t.Optional(t.Any()),
      }),
    }
  );
