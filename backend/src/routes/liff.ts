import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorizeLiff, liffRegistrationRequiredMessage, signLiffSession } from "../lib/auth";
import { verifyLineIdToken } from "../lib/line";
import { customerBalance } from "./line";
import { env } from "../env";
import { audit } from "../services/audit";

const LIFF_CONSENT_VERSION = "2026-09-15";
const sensitiveCategory = t.Union([
  t.Literal("health"), t.Literal("biometric"), t.Literal("criminal_history"), t.Literal("other"),
]);
const consentBody = t.Object({
  general: t.Boolean(), retention: t.Boolean(), truth: t.Boolean(),
  gps: t.Optional(t.Boolean()), sensitive: t.Optional(t.Boolean()),
  sensitive_categories: t.Optional(t.Array(sensitiveCategory)),
  sensitive_other: t.Optional(t.String({ maxLength: 200 })),
  photo: t.Optional(t.Boolean()), image_rights: t.Optional(t.Boolean()), marketing: t.Optional(t.Boolean()),
});

export const liffRoutes = new Elysia({ prefix: "/api/liff" })
  // Exchange a LIFF ID token for a short-lived customer session. A LIFF app is linked to one
  // LINE OA's channel (phase 1), so the caller tells us which OA to look the customer up under.
  .post(
    "/session",
    async ({ body }: any) => {
      const { id_token, oa_id } = body ?? {};
      if (!env.lineLiffChannelId) throw new ApiError("INTERNAL_ERROR", "LIFF not configured");

      const oa = await prisma.lineOaAccount.findFirst({ where: { id: oa_id, isActive: true, organization: { isActive: true } } });
      if (!oa) throw new ApiError("NOT_FOUND", "LINE OA not found");

      const profile = await verifyLineIdToken(id_token, env.lineLiffChannelId);
      if (!profile) throw new ApiError("UNAUTHORIZED", "Invalid LINE ID token");

      const customer = await prisma.customer.findFirst({ where: { lineOaId: oa.id, lineUserId: profile.sub, customerType: "customer", status: "active" } });
      if (!customer) throw new ApiError("NOT_FOUND", liffRegistrationRequiredMessage);

      const token = signLiffSession({ customerId: customer.id, orgId: customer.orgId, lineOaId: oa.id, lineUserId: profile.sub });
      return ok({
        token,
        customer: { customer_code: customer.customerCode, display_name: customer.displayName },
        consent: customer.consentAt ? { acceptedAt: customer.consentAt, version: LIFF_CONSENT_VERSION } : null,
      });
    },
    { body: t.Object({ id_token: t.String({ minLength: 1 }), oa_id: t.String({ minLength: 1 }) }) }
  )

  .resolve(async ({ headers }: any) => ({ ctx: await authorizeLiff(headers) }))

  .post("/me/consent", async ({ ctx, body }: any) => {
    const selection = {
      general: body.general,
      retention: body.retention,
      truth: body.truth,
      gps: body.gps ?? false,
      sensitive: body.sensitive ?? false,
      sensitive_categories: body.sensitive_categories ?? [],
      sensitive_other: body.sensitive_other?.trim() ?? "",
      photo: body.photo ?? false,
      image_rights: body.image_rights ?? false,
      marketing: body.marketing ?? false,
    };
    if (!selection.general || !selection.retention || !selection.truth) {
      throw new ApiError("VALIDATION_ERROR", "กรุณารับทราบข้อมูลและยืนยันว่าข้อมูลที่ให้เป็นความจริง");
    }
    if (selection.sensitive && selection.sensitive_categories.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "กรุณาเลือกประเภทข้อมูลส่วนบุคคลที่อ่อนไหว");
    }
    if (selection.sensitive && selection.sensitive_categories.includes("other") && !selection.sensitive_other) {
      throw new ApiError("VALIDATION_ERROR", "กรุณาระบุประเภทข้อมูลอ่อนไหวอื่น ๆ");
    }
    if (selection.photo && !selection.image_rights) {
      throw new ApiError("VALIDATION_ERROR", "กรุณายืนยันสิทธิในภาพก่อนเผยแพร่ภาพ");
    }
    const acceptedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.updateMany({
        where: { id: ctx.customerId, orgId: ctx.orgId }, data: { consentAt: acceptedAt },
      });
      if (updated.count !== 1) throw new ApiError("NOT_FOUND", "Customer not found");
      await audit(tx, {
        action: "customer_consent", entityType: "customer", entityId: ctx.customerId,
        orgId: ctx.orgId, actorType: "line_user", actorId: ctx.lineUserId,
        newValue: { version: LIFF_CONSENT_VERSION, selections: selection },
      });
    });
    return ok({ consent: { acceptedAt, version: LIFF_CONSENT_VERSION, selections: selection } });
  }, { body: consentBody })

  // Own profile — enough to greet the customer, nothing sensitive.
  .get("/me", async ({ ctx }: any) => {
    const customer = await prisma.customer.findFirst({ where: { id: ctx.customerId, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");
    return ok({ customer_code: customer.customerCode, display_name: customer.displayName, status: customer.status });
  })

  // Outstanding balance + next due date (same computation the LINE 1:1 "ยอด" reply uses).
  .get("/me/balance", async ({ ctx }: any) => {
    const b = await customerBalance(ctx.customerId);
    return ok({ outstanding: b.outstanding, count: b.count, next_due_date: b.nextDue });
  })

  // All installments across the customer's own bill plans.
  .get("/me/installments", async ({ ctx }: any) => {
    const installments = await prisma.billInstallment.findMany({
      where: { billPlan: { customerId: ctx.customerId, orgId: ctx.orgId } },
      select: {
        id: true,
        installmentNo: true,
        dueDate: true,
        amountDue: true,
        amountPaid: true,
        status: true,
        billPlan: { select: { billNo: true } },
      },
      orderBy: [{ billPlan: { billNo: "asc" } }, { installmentNo: "asc" }],
    });
    return ok(installments);
  })

  // Approved payment history only — never pending/rejected submissions.
  .get("/me/payments", async ({ ctx }: any) => {
    const payments = await prisma.payment.findMany({
      where: { customerId: ctx.customerId, orgId: ctx.orgId, status: "approved" },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        paymentMethod: true,
        approvedAt: true,
        billInstallment: { select: { installmentNo: true, billPlan: { select: { billNo: true } } } },
      },
      orderBy: { approvedAt: "desc" },
    });
    return ok(payments);
  });
