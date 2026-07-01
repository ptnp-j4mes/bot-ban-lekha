import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorizeLiff, signLiffSession } from "../lib/auth";
import { verifyLineIdToken } from "../lib/line";
import { customerBalance } from "./line";
import { env } from "../env";

export const liffRoutes = new Elysia({ prefix: "/api/liff" })
  // Exchange a LIFF ID token for a short-lived customer session. A LIFF app is linked to one
  // LINE OA's channel (phase 1), so the caller tells us which OA to look the customer up under.
  .post(
    "/session",
    async ({ body }: any) => {
      const { id_token, oa_id } = body ?? {};
      if (!env.lineLiffChannelId) throw new ApiError("INTERNAL_ERROR", "LIFF not configured");

      const oa = await prisma.lineOaAccount.findFirst({ where: { id: oa_id, isActive: true } });
      if (!oa) throw new ApiError("NOT_FOUND", "LINE OA not found");

      const profile = await verifyLineIdToken(id_token, env.lineLiffChannelId);
      if (!profile) throw new ApiError("UNAUTHORIZED", "Invalid LINE ID token");

      const customer = await prisma.customer.findFirst({ where: { lineOaId: oa.id, lineUserId: profile.sub } });
      if (!customer || customer.status !== "active")
        throw new ApiError("NOT_FOUND", "บัญชี LINE นี้ยังไม่ได้ผูกกับข้อมูลลูกค้า กรุณาติดต่อแอดมิน");

      const token = signLiffSession({ customerId: customer.id, orgId: customer.orgId, lineOaId: oa.id, lineUserId: profile.sub });
      return ok({
        token,
        customer: { customer_code: customer.customerCode, display_name: customer.displayName },
      });
    },
    { body: t.Object({ id_token: t.String({ minLength: 1 }), oa_id: t.String({ minLength: 1 }) }) }
  )

  .resolve(async ({ headers }: any) => ({ ctx: await authorizeLiff(headers) }))

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
