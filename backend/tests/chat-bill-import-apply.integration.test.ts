import { expect, test } from "bun:test";
import { prisma } from "../src/lib/prisma";
import { applyChatBillImport, type ChatBillImportDraft } from "../src/services/chat-bill-import";
import { app } from "../src/app";
import { env } from "../src/env";
import { signJwt } from "../src/lib/jwt";

const rnd = () => Math.random().toString(36).slice(2, 9);

function draft(customerId: string, billNo = 1): ChatBillImportDraft {
  return {
    sourceMessageId: `message-${rnd()}`,
    customerId,
    customerCode: `C-${rnd()}`,
    displayName: "Import test",
    billNo,
    principalAmount: 2000,
    cycleDays: 7,
    startDate: "2026-09-18",
    totalInstallments: 1,
    billPenaltyAmount: 0,
    status: "completed",
    installments: [{
      installmentNo: 1,
      dueDate: "2026-09-18",
      amountDue: 795,
      amountPaid: 795,
      status: "paid",
      isLate: true,
      penaltyAmount: 0,
    }],
  };
}

test("imports paid chat status without a payment and enforces org scope", async () => {
  const org = await prisma.organization.create({ data: { name: `import-${rnd()}` } });
  const foreignOrg = await prisma.organization.create({ data: { name: `foreign-${rnd()}` } });
  const customer = await prisma.customer.create({ data: { orgId: org.id, customerCode: `C-${rnd()}` } });
  const foreignCustomer = await prisma.customer.create({ data: { orgId: foreignOrg.id, customerCode: `C-${rnd()}` } });

  await expect(applyChatBillImport(prisma, org.id, [draft(foreignCustomer.id)])).rejects.toThrow("not in organization");

  const [created] = await applyChatBillImport(prisma, org.id, [draft(customer.id)]);
  expect(created.installments[0].status).toBe("paid");
  expect(Number(created.installments[0].amountPaid)).toBe(795);
  expect(created.installments[0].isLate).toBe(true);
  expect(Number(created.installments[0].penaltyAmount)).toBe(0);
  expect(created.installments[0].paidAt).toBeNull();
  expect(created.installments[0].paidByPaymentId).toBeNull();
  expect(await prisma.payment.count({ where: { customerId: customer.id } })).toBe(0);
});

test("rejects a duplicate customer bill before inserting", async () => {
  const org = await prisma.organization.create({ data: { name: `duplicate-${rnd()}` } });
  const customer = await prisma.customer.create({ data: { orgId: org.id, customerCode: `C-${rnd()}` } });
  const importDraft = draft(customer.id);

  await applyChatBillImport(prisma, org.id, [importDraft]);
  await expect(applyChatBillImport(prisma, org.id, [importDraft])).rejects.toThrow("already exists");
  expect(await prisma.billPlan.count({ where: { orgId: org.id, customerId: customer.id } })).toBe(1);
});

test("rolls back all plans if a later plan fails", async () => {
  const org = await prisma.organization.create({ data: { name: `rollback-${rnd()}` } });
  const customer = await prisma.customer.create({ data: { orgId: org.id, customerCode: `C-${rnd()}` } });
  const first = draft(customer.id, 1);
  const second = draft(customer.id, 2);
  second.totalInstallments = 2;
  second.installments = [
    second.installments[0],
    { ...second.installments[0], dueDate: "2026-09-25", installmentNo: 1 },
  ];

  await expect(applyChatBillImport(prisma, org.id, [first, second])).rejects.toThrow();
  expect(await prisma.billPlan.count({ where: { orgId: org.id, customerId: customer.id } })).toBe(0);
});

test("updates late independently and keeps installment PATCH org-scoped", async () => {
  const org = await prisma.organization.create({ data: { name: `patch-${rnd()}` } });
  const foreignOrg = await prisma.organization.create({ data: { name: `patch-foreign-${rnd()}` } });
  const customer = await prisma.customer.create({ data: { orgId: org.id, customerCode: `C-${rnd()}` } });
  const imported = draft(customer.id);
  imported.status = "active";
  imported.installments[0].status = "pending";
  imported.installments[0].amountPaid = 0;
  imported.installments[0].isLate = false;
  const [plan] = await applyChatBillImport(prisma, org.id, [imported]);

  const member = await prisma.adminUser.create({ data: { lineUserId: `U${rnd()}`, isActive: true } });
  await prisma.membership.create({ data: { orgId: org.id, adminUserId: member.id, role: "admin" } });
  const token = signJwt({ sub: member.id }, env.jwtSecret);
  const foreignMember = await prisma.adminUser.create({ data: { lineUserId: `U${rnd()}`, isActive: true } });
  await prisma.membership.create({ data: { orgId: foreignOrg.id, adminUserId: foreignMember.id, role: "admin" } });
  const foreignToken = signJwt({ sub: foreignMember.id }, env.jwtSecret);
  const headers = {
    authorization: `Bearer ${token}`,
    "x-org-id": org.id,
    "content-type": "application/json",
  };

  const foreign = await app.handle(new Request(`http://localhost/api/installments/${plan.installments[0].id}`, {
    method: "PATCH",
    headers: { ...headers, authorization: `Bearer ${foreignToken}`, "x-org-id": foreignOrg.id },
    body: JSON.stringify({ is_late: true }),
  }));
  expect(foreign.status).toBe(404);

  const response = await app.handle(new Request(`http://localhost/api/installments/${plan.installments[0].id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "pending", is_late: true, penalty_amount: 500 }),
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({ status: "pending", is_late: true, penalty_amount: 500 });
});
