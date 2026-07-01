import { test, expect } from "bun:test";
import { prisma } from "../src/lib/prisma";
import { bangkokToday } from "../src/lib/date";
import { app } from "../src/app";
import { env } from "../src/env";
import { signLiffSession } from "../src/lib/auth";

const rnd = () => Math.random().toString(36).slice(2, 8);
const today = bangkokToday();

env.lineLiffChannelId = "test-liff-channel";

const mkOrg = (name = "org") => prisma.organization.create({ data: { name: `${name}-${rnd()}` } });
const mkOa = (orgId: string) =>
  prisma.lineOaAccount.create({ data: { orgId, name: `oa-${rnd()}`, channelId: "c", channelSecret: "", channelAccessToken: "" } });

async function makeLinkedCustomer(orgId: string, oaId: string, lineUserId: string, amount = 490) {
  const bank = await prisma.bankAccount.create({ data: { orgId, accountName: "n", accountNo: "1", bankName: "b", isDefault: true, isActive: true } });
  const customer = await prisma.customer.create({ data: { orgId, lineOaId: oaId, lineUserId, customerCode: `C${rnd()}`, status: "active" } });
  const plan = await prisma.billPlan.create({
    data: {
      orgId, customerId: customer.id, bankAccountId: bank.id, billNo: 1, principalAmount: amount,
      installmentAmount: amount, cycleType: "interval_days", cycleDays: 7, totalInstallments: 2, startDate: today,
      installments: { create: [{ installmentNo: 1, dueDate: today, amountDue: amount }, { installmentNo: 2, dueDate: today, amountDue: amount }] },
    },
    include: { installments: true },
  });
  return { customer, plan, insts: plan.installments };
}

const liffToken = (customerId: string, orgId: string, lineOaId: string, lineUserId: string) =>
  signLiffSession({ customerId, orgId, lineOaId, lineUserId });
const liffHdr = (token: string) => ({ authorization: `Bearer ${token}` });

test("liff: unauthenticated request to a customer-data route -> 401", async () => {
  const r = await app.handle(new Request("http://localhost/api/liff/me/balance"));
  expect(r.status).toBe(401);
});

test("liff: session exchange requires a linked customer, never leaks who else exists", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ sub: `Unotlinked${rnd()}`, aud: env.lineLiffChannelId }), { status: 200 })) as any;
    const res = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "fake", oa_id: oa.id }),
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("แอดมิน"); // tells the customer to contact an admin
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("liff: session exchange happy path returns a working session token, scoped to the right customer", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const lineUserId = `Ulinked${rnd()}`;
  const { customer } = await makeLinkedCustomer(org.id, oa.id, lineUserId);
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ sub: lineUserId, aud: env.lineLiffChannelId, name: "Test User" }), { status: 200 })) as any;
    const res = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "fake", oa_id: oa.id }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.customer.customer_code).toBe(customer.customerCode);

    const me = await app.handle(new Request("http://localhost/api/liff/me", { headers: liffHdr(body.data.token) }));
    expect(me.status).toBe(200);
    expect((await me.json()).data.customer_code).toBe(customer.customerCode);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("liff: customer isolation — a session only ever sees its own balance/installments/payments", async () => {
  const orgA = await mkOrg("A");
  const orgB = await mkOrg("B");
  const oaA = await mkOa(orgA.id);
  const oaB = await mkOa(orgB.id);
  const a = await makeLinkedCustomer(orgA.id, oaA.id, `Ua${rnd()}`, 490);
  const b = await makeLinkedCustomer(orgB.id, oaB.id, `Ub${rnd()}`, 777);

  const tokenA = liffToken(a.customer.id, orgA.id, oaA.id, a.customer.lineUserId!);

  const balance = await app.handle(new Request("http://localhost/api/liff/me/balance", { headers: liffHdr(tokenA) }));
  expect(balance.status).toBe(200);
  const balanceData = (await balance.json()).data;
  expect(balanceData.outstanding).toBe(980); // A's own 2x490, never B's 777

  const installments = await app.handle(new Request("http://localhost/api/liff/me/installments", { headers: liffHdr(tokenA) }));
  const instData = (await installments.json()).data;
  expect(instData.length).toBe(2);
  expect(instData.every((i: any) => a.insts.some((x) => x.id === i.id))).toBe(true);

  const payments = await app.handle(new Request("http://localhost/api/liff/me/payments", { headers: liffHdr(tokenA) }));
  expect(payments.status).toBe(200);
  expect((await payments.json()).data).toEqual([]);

  // A forged/mismatched token (customer id from A, org id from B) must not be accepted.
  const forged = signLiffSession({ customerId: a.customer.id, orgId: orgB.id, lineOaId: oaB.id, lineUserId: a.customer.lineUserId! });
  const forgedRes = await app.handle(new Request("http://localhost/api/liff/me/balance", { headers: liffHdr(forged) }));
  expect(forgedRes.status).toBe(401);
});

test("liff: only approved payments show in history", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer, insts } = await makeLinkedCustomer(org.id, oa.id, `Upay${rnd()}`);
  await prisma.payment.create({ data: { orgId: org.id, customerId: customer.id, billInstallmentId: insts[0].id, amount: 490, status: "approved" } });
  await prisma.payment.create({ data: { orgId: org.id, customerId: customer.id, billInstallmentId: insts[1].id, amount: 490, status: "reversed" } });

  const token = liffToken(customer.id, org.id, oa.id, customer.lineUserId!);
  const res = await app.handle(new Request("http://localhost/api/liff/me/payments", { headers: liffHdr(token) }));
  const data = (await res.json()).data;
  expect(data.length).toBe(1);
  expect(data[0].amount).toBe(490);
});

test("liff: unlinking/deactivating a customer immediately invalidates their session", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer } = await makeLinkedCustomer(org.id, oa.id, `Udeact${rnd()}`);
  const token = liffToken(customer.id, org.id, oa.id, customer.lineUserId!);

  const before = await app.handle(new Request("http://localhost/api/liff/me/balance", { headers: liffHdr(token) }));
  expect(before.status).toBe(200);

  await prisma.customer.update({ where: { id: customer.id }, data: { status: "inactive" } });
  const after = await app.handle(new Request("http://localhost/api/liff/me/balance", { headers: liffHdr(token) }));
  expect(after.status).toBe(401);
});
