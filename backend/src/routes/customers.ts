import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";

const customerBody = t.Object({
  customer_code: t.String({ minLength: 1 }),
  display_name: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  line_oa_id: t.Optional(t.String()),
});

export const customerRoutes = new Elysia({ prefix: "/api" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .post("/customers", async ({ body, ctx }: any) => {
    const { customer_code, display_name, phone, line_oa_id } = body ?? {};
    if (!customer_code) throw new ApiError("VALIDATION_ERROR", "customer_code is required");
    if (line_oa_id) {
      const oa = await prisma.lineOaAccount.findFirst({ where: { id: line_oa_id, orgId: ctx.orgId } });
      if (!oa) throw new ApiError("NOT_FOUND", "LINE OA not found in this org");
      if (!oa.isActive) throw new ApiError("VALIDATION_ERROR", "LINE OA is inactive");
    }
    const c = await prisma.customer.create({
      data: { orgId: ctx.orgId, customerCode: customer_code, displayName: display_name, phone, lineOaId: line_oa_id ?? null },
    });
    await audit(prisma, { action: "create_customer", entityType: "customer", entityId: c.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: c });
    return ok(c);
  }, { body: customerBody })

  .get("/customers", async ({ query, ctx }: any) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 20));
    const where: any = { orgId: ctx.orgId };
    if (query.status) where.status = query.status;
    if (query.search)
      where.OR = [
        { customerCode: { contains: query.search, mode: "insensitive" } },
        { displayName: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } },
      ];
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" } }),
      prisma.customer.count({ where }),
    ]);
    return ok({ items, total, page, limit });
  })

  .get("/customers/:id", async ({ params, ctx }: any) => {
    const c = await prisma.customer.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!c) throw new ApiError("NOT_FOUND", "Customer not found");
    return ok(c);
  })

  .patch("/customers/:id", async ({ params, body, ctx }: any) => {
    const old = await prisma.customer.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!old) throw new ApiError("NOT_FOUND", "Customer not found");
    const data: any = {};
    for (const [k, col] of [
      ["display_name", "displayName"],
      ["phone", "phone"],
      ["status", "status"],
    ] as const)
      if (body?.[k] !== undefined) data[col] = body[k];
    const c = await prisma.customer.update({ where: { id: params.id }, data });
    await audit(prisma, { action: "update_customer", entityType: "customer", entityId: c.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: old, newValue: c });
    return ok(c);
  })

  .post("/customers/link-line", async ({ body, ctx }: any) => {
    const { customer_code, line_user_id } = body ?? {};
    if (!customer_code || !line_user_id)
      throw new ApiError("VALIDATION_ERROR", "customer_code and line_user_id are required");
    const customer = await prisma.customer.findFirst({ where: { orgId: ctx.orgId, customerCode: customer_code } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");
    const clash = await prisma.customer.findFirst({
      where: { orgId: ctx.orgId, lineOaId: customer.lineOaId, lineUserId: line_user_id, id: { not: customer.id } },
    });
    if (clash)
      throw new ApiError("VALIDATION_ERROR", "line_user_id already linked to another customer in this OA");
    const c = await prisma.customer.update({ where: { id: customer.id }, data: { lineUserId: line_user_id } });
    await audit(prisma, { action: "link_line", entityType: "customer", entityId: c.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: { lineUserId: line_user_id } });
    return ok(c);
  })

  .get("/customers/:id/bill-plans", async ({ params, ctx }: any) => {
    const plans = await prisma.billPlan.findMany({
      where: { customerId: params.id, orgId: ctx.orgId },
      include: { installments: { orderBy: { installmentNo: "asc" } }, bankAccount: true },
      orderBy: { billNo: "asc" },
    });
    return ok(plans);
  })

  // Full customer view: bills, payments, slips, recent messages.
  .get("/customers/:id/detail", async ({ params, ctx }: any) => {
    const customer = await prisma.customer.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");
    const [billPlans, payments, submissions, messageLogs] = await Promise.all([
      prisma.billPlan.findMany({ where: { customerId: customer.id }, include: { installments: { orderBy: { installmentNo: "asc" } }, bankAccount: true }, orderBy: { billNo: "asc" } }),
      prisma.payment.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }),
      prisma.paymentSubmission.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.messageLog.findMany({ where: { customerId: customer.id }, orderBy: { sentAt: "desc" }, take: 50 }),
    ]);
    return ok({ customer, bill_plans: billPlans, payments, submissions, message_logs: messageLogs });
  })

  // Bulk create customers (CSV import).
  .post(
    "/customers/bulk",
    async ({ body, ctx }: any) => {
      const rows = (body.rows ?? []).filter((r: any) => r.customer_code);
      if (!rows.length) throw new ApiError("VALIDATION_ERROR", "no rows");
      const r = await prisma.customer.createMany({
        data: rows.map((x: any) => ({ orgId: ctx.orgId, customerCode: String(x.customer_code), displayName: x.display_name || null, phone: x.phone || null })),
        skipDuplicates: true,
      });
      await audit(prisma, { action: "import_customers", entityType: "customer", orgId: ctx.orgId, actorId: ctx.userId, newValue: { count: r.count } });
      return ok({ created: r.count, received: rows.length });
    },
    { body: t.Object({ rows: t.Array(t.Object({ customer_code: t.String(), display_name: t.Optional(t.String()), phone: t.Optional(t.String()) })) }) }
  );
