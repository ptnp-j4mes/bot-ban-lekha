import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";

const bankBody = t.Object({
  account_name: t.String({ minLength: 1 }),
  account_no: t.String({ minLength: 1 }),
  bank_name: t.String({ minLength: 1 }),
  bank_code: t.Optional(t.String()),
  branch_name: t.Optional(t.String()),
  is_default: t.Optional(t.Boolean()),
  is_active: t.Optional(t.Boolean()),
  note: t.Optional(t.String()),
});

export const bankAccountRoutes = new Elysia({ prefix: "/api/bank-accounts" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) => ok(await prisma.bankAccount.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } })))

  .post("/", async ({ body, ctx }: any) => {
    const { account_name, account_no, bank_name, bank_code, branch_name, is_default, is_active, note } = body ?? {};
    if (!account_no) throw new ApiError("VALIDATION_ERROR", "account_no is required");
    if (!account_name) throw new ApiError("VALIDATION_ERROR", "account_name is required");
    if (!bank_name) throw new ApiError("VALIDATION_ERROR", "bank_name is required");
    const acc = await prisma.$transaction(async (tx) => {
      if (is_default) await tx.bankAccount.updateMany({ where: { orgId: ctx.orgId }, data: { isDefault: false } });
      const a = await tx.bankAccount.create({
        data: {
          orgId: ctx.orgId,
          accountName: account_name,
          accountNo: account_no,
          bankName: bank_name,
          bankCode: bank_code,
          branchName: branch_name,
          isDefault: !!is_default,
          isActive: is_active ?? true,
          note,
        },
      });
      await audit(tx, { action: "create_bank_account", entityType: "bank_account", entityId: a.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: a });
      return a;
    });
    return ok(acc);
  }, { body: bankBody })

  .patch("/:id", async ({ params, body, ctx }: any) => {
    const old = await prisma.bankAccount.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!old) throw new ApiError("BANK_ACCOUNT_NOT_FOUND", "Bank account not found");
    const data: any = {};
    for (const [k, col] of [
      ["account_name", "accountName"],
      ["account_no", "accountNo"],
      ["bank_name", "bankName"],
      ["bank_code", "bankCode"],
      ["branch_name", "branchName"],
      ["is_active", "isActive"],
      ["note", "note"],
    ] as const)
      if (body?.[k] !== undefined) data[col] = body[k];
    const acc = await prisma.$transaction(async (tx) => {
      if (body?.is_default === true) await tx.bankAccount.updateMany({ where: { orgId: ctx.orgId }, data: { isDefault: false } });
      if (body?.is_default !== undefined) data.isDefault = body.is_default;
      const a = await tx.bankAccount.update({ where: { id: params.id }, data });
      await audit(tx, { action: "update_bank_account", entityType: "bank_account", entityId: a.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: old, newValue: a });
      return a;
    });
    return ok(acc);
  })

  .patch("/:id/set-default", async ({ params, ctx }: any) => {
    const acc = await prisma.bankAccount.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!acc) throw new ApiError("BANK_ACCOUNT_NOT_FOUND", "Bank account not found");
    if (!acc.isActive) throw new ApiError("BANK_ACCOUNT_INACTIVE", "Cannot set inactive account as default");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.bankAccount.updateMany({ where: { orgId: ctx.orgId }, data: { isDefault: false } });
      const a = await tx.bankAccount.update({ where: { id: params.id }, data: { isDefault: true } });
      await audit(tx, { action: "set_default_bank_account", entityType: "bank_account", entityId: a.id, orgId: ctx.orgId, actorId: ctx.userId });
      return a;
    });
    return ok(updated);
  })

  .patch("/:id/deactivate", async ({ params, ctx }: any) => {
    const acc = await prisma.bankAccount.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!acc) throw new ApiError("BANK_ACCOUNT_NOT_FOUND", "Bank account not found");
    if (acc.isDefault) {
      const other = await prisma.bankAccount.findFirst({ where: { orgId: ctx.orgId, isActive: true, id: { not: acc.id } } });
      if (!other)
        throw new ApiError("DEFAULT_BANK_ACCOUNT_REQUIRED", "Set another default before deactivating this account");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.bankAccount.update({ where: { id: params.id }, data: { isActive: false, isDefault: false } });
      await audit(tx, { action: "deactivate_bank_account", entityType: "bank_account", entityId: a.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: acc, newValue: a });
      return a;
    });
    return ok(updated);
  });
