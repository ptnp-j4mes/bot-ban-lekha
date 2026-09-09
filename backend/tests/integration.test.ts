import { test, expect } from "bun:test";
import { prisma } from "../src/lib/prisma";
import { bangkokToday } from "../src/lib/date";
import { processSubmission, approveSubmission, matchInstallment, rejectSubmission } from "../src/services/payment";
import { effectiveRetentionDays, purgeSlipImage, purgeExpiredSlips } from "../src/services/retention";
import { deleteSlipFile } from "../src/services/storage";
import { app } from "../src/app";
import { env } from "../src/env";
import { signJwt } from "../src/lib/jwt";

const tag = `${Date.now()}`;
const rnd = () => Math.random().toString(36).slice(2, 8);
const today = bangkokToday();

const mkOrg = (name = "org") => prisma.organization.create({ data: { name: `${name}-${rnd()}` } });
const mkOa = (orgId: string, secret = "") =>
  prisma.lineOaAccount.create({ data: { orgId, name: `oa-${rnd()}`, channelId: "c", channelSecret: secret, channelAccessToken: "" } });

async function mkMember(orgId: string, role: string) {
  const user = await prisma.adminUser.create({ data: { lineUserId: `U${role}${rnd()}`, isActive: true } });
  await prisma.membership.create({ data: { orgId, adminUserId: user.id, role } });
  return { user, token: signJwt({ sub: user.id }, env.jwtSecret) };
}
const hdr = (token: string, orgId: string) => ({ authorization: `Bearer ${token}`, "x-org-id": orgId });
const apiHdr = (orgId: string) => ({ "x-api-key": "change-me", "x-org-id": orgId });

async function makePlan(orgId: string, amount = 490, lineOaId?: string) {
  const bank = await prisma.bankAccount.create({
    data: { orgId, accountName: "n", accountNo: "1", bankName: "b", isDefault: true, isActive: true },
  });
  const customer = await prisma.customer.create({
    data: {
      orgId,
      customerCode: `C${rnd()}`,
      status: "active",
      ...(lineOaId ? { lineOaId, lineUserId: `U${rnd()}` } : {}),
    },
  });
  const plan = await prisma.billPlan.create({
    data: {
      orgId, customerId: customer.id, bankAccountId: bank.id, billNo: 1, principalAmount: amount,
      installmentAmount: amount, cycleType: "interval_days", cycleDays: 7, totalInstallments: 1, startDate: today,
      installments: { create: [{ installmentNo: 1, dueDate: today, amountDue: amount }] },
    },
    include: { installments: true },
  });
  return { customer, plan, inst: plan.installments[0] };
}

const webhook = (oaId: string, event: any) =>
  app.handle(new Request(`http://localhost/api/line/webhook/${oaId}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event),
  }));
const imageEvent = (userId: string, id: string) => ({
  events: [{ type: "message", source: { userId }, message: { type: "image", id } }],
});

// ---------- money path ----------
test("auto-match + approve: paid + plan completed, scoped to org", async () => {
  const org = await mkOrg();
  const { plan, inst, customer } = await makePlan(org.id);
  const sub = await prisma.paymentSubmission.create({
    data: { orgId: org.id, customerId: customer.id, parsedAmount: 490, parsedTransferDate: today, parsedReferenceNo: `R${tag}`, imageHash: `H${tag}`, ocrStatus: "success" },
  });
  await processSubmission(sub.id);
  const matched = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(matched!.matchStatus).toBe("auto_matched");
  expect(matched!.matchedInstallmentId).toBe(inst.id);

  await approveSubmission(sub.id, "actor", org.id);
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))!.status).toBe("paid");
  expect((await prisma.billPlan.findUnique({ where: { id: plan.id } }))!.status).toBe("completed");
  expect((await prisma.payment.findFirst({ where: { paymentSubmissionId: sub.id } }))!.orgId).toBe(org.id);
});

test("exact amount, date, and destination account auto-approve with one payment_approved reply", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { plan, inst, customer } = await makePlan(org.id, 490, oa.id);
  await prisma.bankAccount.update({ where: { id: plan.bankAccountId }, data: { accountNo: "1234567890" } });
  const sub = await prisma.paymentSubmission.create({
    data: {
      orgId: org.id,
      lineOaId: oa.id,
      lineUserId: customer.lineUserId,
      customerId: customer.id,
      parsedAmount: 490,
      parsedTransferDate: today,
      parsedAccountNo: "123-456-7890",
      parsedReferenceNo: `EXACT${rnd()}`,
      imageHash: `EXACT${rnd()}`,
      docType: "slip",
      ocrStatus: "success",
    },
  });

  await processSubmission(sub.id);

  const updated = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(updated?.matchStatus).toBe("auto_matched");
  expect(updated?.reviewStatus).toBe("approved");
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))?.status).toBe("paid");
  expect((await prisma.payment.findFirst({ where: { paymentSubmissionId: sub.id } }))?.amount.toString()).toBe("490");

  const replies = await prisma.messageLog.findMany({
    where: { paymentSubmissionId: sub.id, direction: "outbound" },
    orderBy: { sentAt: "asc" },
  });
  expect(replies.map((reply) => reply.messageType)).toEqual(["payment_approved"]);
  expect(replies[0]?.messageText).toContain(`${today.getUTCDate()}💸 490✅`);
});

test("exact facts from an unknown document do not auto-approve", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { plan, inst, customer } = await makePlan(org.id, 490, oa.id);
  await prisma.bankAccount.update({ where: { id: plan.bankAccountId }, data: { accountNo: "1234567890" } });
  const sub = await prisma.paymentSubmission.create({
    data: {
      orgId: org.id,
      lineOaId: oa.id,
      lineUserId: customer.lineUserId,
      customerId: customer.id,
      parsedAmount: 490,
      parsedTransferDate: today,
      parsedAccountNo: "123-456-7890",
      parsedReferenceNo: `UNKNOWN${rnd()}`,
      imageHash: `UNKNOWN${rnd()}`,
      docType: "unknown",
      ocrStatus: "success",
    },
  });

  await processSubmission(sub.id);

  const updated = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(updated?.matchStatus).toBe("auto_matched");
  expect(updated?.reviewStatus).toBe("pending_review");
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))?.status).toBe("pending");
  expect(await prisma.payment.count({ where: { paymentSubmissionId: sub.id } })).toBe(0);
});

test("duplicate slip rejected on approve", async () => {
  const org = await mkOrg();
  const a = await makePlan(org.id);
  const sub1 = await prisma.paymentSubmission.create({ data: { orgId: org.id, customerId: a.customer.id, matchedInstallmentId: a.inst.id, parsedReferenceNo: `DUP${tag}`, reviewStatus: "approved" } });
  const b = await makePlan(org.id);
  const sub2 = await prisma.paymentSubmission.create({ data: { orgId: org.id, customerId: b.customer.id, parsedReferenceNo: `DUP${tag}` } });
  await matchInstallment(sub2.id, b.inst.id, "x", "actor", org.id);
  await expect(approveSubmission(sub2.id, "actor", org.id)).rejects.toThrow(/already used/i);
  void sub1;
});

test("OCR failed -> needs_admin_match", async () => {
  const org = await mkOrg();
  const { customer } = await makePlan(org.id);
  const sub = await prisma.paymentSubmission.create({ data: { orgId: org.id, customerId: customer.id, ocrStatus: "failed" } });
  await processSubmission(sub.id);
  expect((await prisma.paymentSubmission.findUnique({ where: { id: sub.id } }))!.matchStatus).toBe("needs_admin_match");
});

test("reject sets statuses + logs", async () => {
  const org = await mkOrg();
  const { customer } = await makePlan(org.id);
  const sub = await prisma.paymentSubmission.create({ data: { orgId: org.id, customerId: customer.id, matchStatus: "needs_admin_match" } });
  await rejectSubmission(sub.id, "ยอดไม่ตรง", "actor", org.id);
  const r = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(r!.reviewStatus).toBe("rejected");
  expect(await prisma.messageLog.count({ where: { paymentSubmissionId: sub.id, messageType: "payment_rejected" } })).toBe(1);
});

// ---------- RBAC within an org ----------
test("member has full access in own org (read + write)", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const url = "http://localhost/api/customers";
  expect((await app.handle(new Request(url, { headers: hdr(m.token, org.id) }))).status).toBe(200);
  const post = await app.handle(new Request(url, {
    method: "POST", headers: { ...hdr(m.token, org.id), "content-type": "application/json" }, body: JSON.stringify({ customer_code: `M${rnd()}` }),
  }));
  expect(post.status).toBe(200);
});

test("missing x-org-id on org route -> 400", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "admin");
  const r = await app.handle(new Request("http://localhost/api/customers", { headers: { authorization: `Bearer ${m.token}` } }));
  expect(r.status).toBe(400);
});

// ---------- TENANT ISOLATION (the core security property) ----------
test("tenant isolation: a member cannot read another org's data", async () => {
  const orgA = await mkOrg("A");
  const orgB = await mkOrg("B");
  await prisma.customer.create({ data: { orgId: orgA.id, customerCode: `A${rnd()}` } });
  await prisma.customer.create({ data: { orgId: orgB.id, customerCode: `B${rnd()}` } });
  const memberA = await mkMember(orgA.id, "owner");

  // listing with own org returns only own customers
  const listA = await app.handle(new Request("http://localhost/api/customers?limit=100", { headers: hdr(memberA.token, orgA.id) }));
  const dataA = (await listA.json()).data.items;
  expect(dataA.every((c: any) => c.org_id === orgA.id)).toBe(true);

  // trying to act on orgB (not a member) -> 403
  const cross = await app.handle(new Request("http://localhost/api/customers", { headers: hdr(memberA.token, orgB.id) }));
  expect(cross.status).toBe(403);
});

test("cannot approve a submission from another org", async () => {
  const orgA = await mkOrg();
  const orgB = await mkOrg();
  const { customer, inst } = await makePlan(orgA.id);
  const sub = await prisma.paymentSubmission.create({ data: { orgId: orgA.id, customerId: customer.id, matchedInstallmentId: inst.id, parsedAmount: 490 } });
  // approving with orgB scope must not find it
  await expect(approveSubmission(sub.id, "actor", orgB.id)).rejects.toThrow(/not found/i);
});

// ---------- webhook / multi-OA ----------
test("webhook per-OA sets org + customer; unknown OA 404", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const customer = await prisma.customer.create({ data: { orgId: org.id, customerCode: `W${rnd()}`, lineOaId: oa.id, lineUserId: `Uw${rnd()}`, status: "active" } });
  const res = await webhook(oa.id, imageEvent(customer.lineUserId!, `m${rnd()}`));
  expect(res.status).toBe(200);
  const sub = await prisma.paymentSubmission.findFirst({ where: { lineOaId: oa.id }, orderBy: { createdAt: "desc" } });
  expect(sub!.orgId).toBe(org.id);
  expect(sub!.customerId).toBe(customer.id);

  expect((await webhook("00000000-0000-0000-0000-000000000000", imageEvent("Ux", "mx"))).status).toBe(404);
});

test("group slip: webhook stores group id (no customer); matched org-wide then approved", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { inst, customer } = await makePlan(org.id);

  const gid = `G${rnd()}`;
  const ev = { events: [{ type: "message", source: { type: "group", groupId: gid, userId: `Ustaff${rnd()}` }, message: { type: "image", id: `gm${rnd()}` } }] };
  expect((await webhook(oa.id, ev)).status).toBe(200);
  const sub0 = await prisma.paymentSubmission.findFirst({ where: { lineGroupId: gid } });
  expect(sub0!.lineGroupId).toBe(gid);
  expect(sub0!.customerId).toBeNull();

  const sub = await prisma.paymentSubmission.create({
    data: { orgId: org.id, lineOaId: oa.id, lineGroupId: gid, parsedAmount: 490, parsedTransferDate: today, parsedReferenceNo: `G${rnd()}`, ocrStatus: "success" },
  });
  await processSubmission(sub.id);
  const matched = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(matched!.matchStatus).toBe("auto_matched");
  expect(matched!.matchedInstallmentId).toBe(inst.id);

  await approveSubmission(sub.id, "actor", org.id);
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))!.status).toBe("paid");
  expect((await prisma.payment.findFirst({ where: { paymentSubmissionId: sub.id } }))!.customerId).toBe(customer.id);
});

test("group slip sender: registered + renamable, backfills slips", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const m = await mkMember(org.id, "user");
  const uid = `Ustaff${rnd()}`;
  await webhook(oa.id, { events: [{ type: "message", source: { type: "group", groupId: `G${rnd()}`, userId: uid }, message: { type: "image", id: `gm${rnd()}` } }] });

  const senders = (await (await app.handle(new Request("http://localhost/api/senders", { headers: hdr(m.token, org.id) }))).json()).data;
  const sender = senders.find((s: any) => s.line_user_id === uid);
  expect(sender).toBeTruthy();
  expect(sender.slip_count).toBeGreaterThanOrEqual(1);

  const ren = await app.handle(new Request(`http://localhost/api/senders/${sender.id}`, {
    method: "PATCH", headers: { ...hdr(m.token, org.id), "content-type": "application/json" }, body: JSON.stringify({ name: "พี่สมชาย" }),
  }));
  expect(ren.status).toBe(200);
  const sub = await prisma.paymentSubmission.findFirst({ where: { lineUserId: uid } });
  expect(sub!.senderName).toBe("พี่สมชาย"); // existing slips updated
});

test("daily report: per-group breakdown + combined totals", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const g1 = `G${rnd()}`, g2 = `G${rnd()}`;
  await prisma.lineGroup.createMany({ data: [{ orgId: org.id, lineGroupId: g1, name: "กลุ่ม A" }, { orgId: org.id, lineGroupId: g2, name: "กลุ่ม B" }] });
  const { inst } = await makePlan(org.id);
  await prisma.paymentSubmission.create({ data: { orgId: org.id, lineGroupId: g1, reviewStatus: "pending_review" } });
  const s2 = await prisma.paymentSubmission.create({ data: { orgId: org.id, lineGroupId: g1, matchedInstallmentId: inst.id, parsedAmount: 490 } });
  await approveSubmission(s2.id, "actor", org.id);
  await prisma.paymentSubmission.create({ data: { orgId: org.id, lineGroupId: g2, reviewStatus: "rejected" } });

  const rep = (await (await app.handle(new Request("http://localhost/api/reports/daily", { headers: hdr(m.token, org.id) }))).json()).data;
  expect(rep.combined.received).toBe(3);
  expect(rep.combined.approved).toBe(1);
  expect(rep.combined.amount).toBe(490);
  const ga = rep.groups.find((g: any) => g.line_group_id === g1);
  expect(ga.received).toBe(2);
  expect(ga.name).toBe("กลุ่ม A");
});

test("line-oa-accounts: secrets masked, member can read + write, org-scoped", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  await prisma.lineOaAccount.update({ where: { id: oa.id }, data: { channelSecret: "S", channelAccessToken: "T" } });
  const m = await mkMember(org.id, "user");

  const r = await app.handle(new Request("http://localhost/api/line-oa-accounts", { headers: hdr(m.token, org.id) }));
  const found = (await r.json()).data.find((o: any) => o.id === oa.id);
  expect(found.channel_secret).toBeUndefined(); // masked
  expect(found.has_token).toBe(true);

  const created = await app.handle(new Request("http://localhost/api/line-oa-accounts", {
    method: "POST", headers: { ...hdr(m.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ name: "x", channel_id: "1", channel_secret: "s", channel_access_token: "t" }),
  }));
  expect(created.status).toBe(200); // member can manage their org's OA
});

// ---------- super admin (platform) ----------
test("platform routes: super admin only", async () => {
  const org = await mkOrg();
  const member = await mkMember(org.id, "user");
  const denied = await app.handle(new Request("http://localhost/api/platform/admin-users", { headers: { authorization: `Bearer ${member.token}` } }));
  expect(denied.status).toBe(403);
  const ok = await app.handle(new Request("http://localhost/api/platform/admin-users", { headers: { "x-api-key": "change-me" } }));
  expect(ok.status).toBe(200);
});

test("super admin creates a user in an org; that user is scoped to it", async () => {
  const username = `u${rnd()}`;
  const orgName = `Org-${rnd()}`;
  const created = await app.handle(new Request("http://localhost/api/platform/admin-users", {
    method: "POST", headers: { "x-api-key": "change-me", "content-type": "application/json" },
    body: JSON.stringify({ username, password: "pw123456", org_name: orgName }),
  }));
  expect(created.status).toBe(200);
  const u = (await created.json()).data;
  expect(u.org.name).toBe(orgName);
  expect(u.is_platform_admin).toBe(false);

  // the user logs in and /me returns exactly their org
  const login = await app.handle(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: "pw123456" }),
  }));
  const token = (await login.json()).data.token;
  const me = await app.handle(new Request("http://localhost/api/auth/me", { headers: { authorization: `Bearer ${token}` } }));
  const meData = (await me.json()).data;
  expect(meData.org.id).toBe(u.org.id);
  expect(meData.is_platform_admin).toBe(false);

  // user can operate in their org, but not another
  expect((await app.handle(new Request("http://localhost/api/customers", { headers: hdr(token, u.org.id) }))).status).toBe(200);
  const otherOrg = await mkOrg();
  expect((await app.handle(new Request("http://localhost/api/customers", { headers: hdr(token, otherOrg.id) }))).status).toBe(403);
});

test("username/password login: super admin gets a working platform token", async () => {
  const username = `super${rnd()}`;
  await prisma.adminUser.create({
    data: { username, passwordHash: await Bun.password.hash("secret123"), isPlatformAdmin: true, isActive: true, displayName: "S" },
  });
  const post = (body: any) =>
    app.handle(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  expect((await post({ username, password: "wrong" })).status).toBe(401);
  const ok = await post({ username, password: "secret123" });
  expect(ok.status).toBe(200);
  const token = (await ok.json()).data.token;

  const me = await app.handle(new Request("http://localhost/api/auth/me", { headers: { authorization: `Bearer ${token}` } }));
  expect((await me.json()).data.is_platform_admin).toBe(true);
  // platform token can manage organizations
  const plat = await app.handle(new Request("http://localhost/api/platform/organizations", { headers: { authorization: `Bearer ${token}` } }));
  expect(plat.status).toBe(200);
});

test("native LINE login: verifies ID token, upserts admin, and returns JWT", async () => {
  const previousChannel = env.lineLoginChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLoginChannelId = "mobile-line-channel";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("https://api.line.me/oauth2/v2.1/verify");
    return new Response(JSON.stringify({ sub: `Umobile${rnd()}`, name: "Native Admin", aud: "mobile-line-channel" }), { status: 200 });
  }) as typeof fetch;

  try {
    const res = await app.handle(new Request("http://localhost/api/auth/mobile/line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "signed-by-line" }),
    }));
    expect(res.status).toBe(200);
    const token = (await res.json()).data.token;
    const me = await app.handle(new Request("http://localhost/api/auth/me", { headers: { authorization: `Bearer ${token}` } }));
    expect((await me.json()).data.name).toBe("Native Admin");
  } finally {
    env.lineLoginChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("native LINE login: rejects an ID token issued for another channel", async () => {
  const previousChannel = env.lineLoginChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLoginChannelId = "mobile-line-channel";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sub: `Uwrong${rnd()}`, aud: "different-channel" }), { status: 200 })) as typeof fetch;

  try {
    const res = await app.handle(new Request("http://localhost/api/auth/mobile/line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "issued-for-another-channel" }),
    }));
    expect(res.status).toBe(401);
  } finally {
    env.lineLoginChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("native LINE login: inactive account is blocked", async () => {
  const lineUserId = `Uinactive${rnd()}`;
  await prisma.adminUser.create({
    data: { lineUserId, displayName: "Inactive Admin", isPlatformAdmin: false, isActive: false },
  });
  const previousChannel = env.lineLoginChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLoginChannelId = "mobile-line-channel";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sub: lineUserId, aud: "mobile-line-channel" }), { status: 200 })) as typeof fetch;

  try {
    const res = await app.handle(new Request("http://localhost/api/auth/mobile/line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "valid-but-inactive" }),
    }));
    expect(res.status).toBe(403);
  } finally {
    env.lineLoginChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("native LINE login: active account without org membership cannot access tenant data", async () => {
  const lineUserId = `Unoorg${rnd()}`;
  const user = await prisma.adminUser.create({
    data: { lineUserId, displayName: "Unassigned Admin", isPlatformAdmin: false, isActive: true },
  });
  const org = await mkOrg();
  const previousChannel = env.lineLoginChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLoginChannelId = "mobile-line-channel";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sub: lineUserId, aud: "mobile-line-channel" }), { status: 200 })) as typeof fetch;

  try {
    const res = await app.handle(new Request("http://localhost/api/auth/mobile/line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "valid-without-org" }),
    }));
    expect(res.status).toBe(200);
    const token = (await res.json()).data.token;
    const forbidden = await app.handle(new Request("http://localhost/api/customers", {
      headers: hdr(token, org.id),
    }));
    expect(forbidden.status).toBe(403);
    expect(user.isActive).toBe(true);
  } finally {
    env.lineLoginChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("customer LIFF session: oa_id selects the correct tenant", async () => {
  const orgA = await mkOrg("liff-a");
  const orgB = await mkOrg("liff-b");
  const oaA = await mkOa(orgA.id);
  const oaB = await mkOa(orgB.id);
  const lineUserId = `Uliff${rnd()}`;
  const customerA = await prisma.customer.create({
    data: { orgId: orgA.id, lineOaId: oaA.id, lineUserId, customerCode: `A${rnd()}`, displayName: "Customer A", status: "active" },
  });
  await prisma.customer.create({
    data: { orgId: orgB.id, lineOaId: oaB.id, lineUserId, customerCode: `B${rnd()}`, displayName: "Customer B", status: "active" },
  });
  const previousChannel = env.lineLiffChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLiffChannelId = "liff-line-channel";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sub: lineUserId, aud: "liff-line-channel" }), { status: 200 })) as typeof fetch;

  try {
    const session = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "customer-id-token", oa_id: oaA.id }),
    }));
    expect(session.status).toBe(200);
    const payload = (await session.json()).data;
    expect(payload.customer.customer_code).toBe(customerA.customerCode);

    const me = await app.handle(new Request("http://localhost/api/liff/me", {
      headers: { authorization: `Bearer ${payload.token}` },
    }));
    expect((await me.json()).data.display_name).toBe("Customer A");
  } finally {
    env.lineLiffChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("customer LIFF session: rejects an OA that is not active or does not match", async () => {
  const org = await mkOrg("liff-oa");
  const oa = await mkOa(org.id);
  const previousChannel = env.lineLiffChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLiffChannelId = "liff-line-channel";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sub: `Uliff${rnd()}`, aud: "liff-line-channel" }), { status: 200 })) as typeof fetch;

  try {
    const missing = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "customer-id-token", oa_id: `missing-${rnd()}` }),
    }));
    expect(missing.status).toBe(404);

    await prisma.lineOaAccount.update({ where: { id: oa.id }, data: { isActive: false } });
    const inactive = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "customer-id-token", oa_id: oa.id }),
    }));
    expect(inactive.status).toBe(404);
  } finally {
    env.lineLiffChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("customer LIFF session: unlinked and inactive customers are rejected", async () => {
  const org = await mkOrg("liff-customer");
  const oa = await mkOa(org.id);
  const lineUserId = `Unotlinked${rnd()}`;
  await prisma.customer.create({
    data: { orgId: org.id, lineOaId: oa.id, lineUserId: `Uother${rnd()}`, customerCode: `N${rnd()}`, status: "active" },
  });
  const inactive = await prisma.customer.create({
    data: { orgId: org.id, lineOaId: oa.id, lineUserId, customerCode: `I${rnd()}`, status: "inactive" },
  });
  const previousChannel = env.lineLiffChannelId;
  const previousFetch = globalThis.fetch;
  env.lineLiffChannelId = "liff-line-channel";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sub: lineUserId, aud: "liff-line-channel" }), { status: 200 })) as typeof fetch;

  try {
    const inactiveResponse = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "customer-id-token", oa_id: oa.id }),
    }));
    expect(inactiveResponse.status).toBe(404);
    expect(inactive.status).toBe("inactive");

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ sub: `Uunlinked${rnd()}`, aud: "liff-line-channel" }), { status: 200 })) as typeof fetch;
    const unlinked = await app.handle(new Request("http://localhost/api/liff/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: "customer-id-token", oa_id: oa.id }),
    }));
    expect(unlinked.status).toBe(404);
  } finally {
    env.lineLiffChannelId = previousChannel;
    globalThis.fetch = previousFetch;
  }
});

test("settings: member reads/updates org footer + timezone", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const patch = await app.handle(new Request("http://localhost/api/settings", {
    method: "PATCH", headers: { ...hdr(m.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ bill_footer: "เกิน 17.00 ปรับ 50", timezone: "Asia/Bangkok" }),
  }));
  expect(patch.status).toBe(200);
  const get = await app.handle(new Request("http://localhost/api/settings", { headers: hdr(m.token, org.id) }));
  expect((await get.json()).data.bill_footer).toBe("เกิน 17.00 ปรับ 50");
});

test("settings: auto match mode defaults on and can be toggled", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const get = await app.handle(new Request("http://localhost/api/settings", { headers: hdr(m.token, org.id) }));
  expect((await get.json()).data.auto_match_enabled).toBe(true);

  for (const enabled of [false, true]) {
    const patch = await app.handle(new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { ...hdr(m.token, org.id), "content-type": "application/json" },
      body: JSON.stringify({ auto_match_enabled: enabled }),
    }));
    expect(patch.status).toBe(200);
    expect((await patch.json()).data.auto_match_enabled).toBe(enabled);
  }
});

test("disabled auto match keeps an exact slip pending for admin matching", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const m = await mkMember(org.id, "user");
  const setting = await app.handle(new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { ...hdr(m.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ auto_match_enabled: false }),
  }));
  expect(setting.status).toBe(200);

  const { plan, inst, customer } = await makePlan(org.id, 490, oa.id);
  await prisma.bankAccount.update({ where: { id: plan.bankAccountId }, data: { accountNo: "1234567890" } });
  const sub = await prisma.paymentSubmission.create({
    data: {
      orgId: org.id,
      lineOaId: oa.id,
      lineUserId: customer.lineUserId,
      customerId: customer.id,
      parsedAmount: 490,
      parsedTransferDate: today,
      parsedAccountNo: "1234567890",
      parsedReferenceNo: `MANUAL${rnd()}`,
      imageHash: `MANUAL${rnd()}`,
      docType: "slip",
      ocrStatus: "success",
    },
  });

  await processSubmission(sub.id);

  const updated = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(updated?.matchStatus).toBe("needs_admin_match");
  expect(updated?.matchedInstallmentId).toBeNull();
  expect(updated?.reviewStatus).toBe("pending_review");
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))?.status).toBe("pending");
  expect(await prisma.payment.count({ where: { paymentSubmissionId: sub.id } })).toBe(0);
  expect((await prisma.messageLog.findFirst({ where: { paymentSubmissionId: sub.id, direction: "outbound" } }))?.messageType).toBe("payment_need_admin");
});

test("change-password: user can change own password and log in with it", async () => {
  const username = `cp${rnd()}`;
  await app.handle(new Request("http://localhost/api/platform/admin-users", {
    method: "POST", headers: { "x-api-key": "change-me", "content-type": "application/json" },
    body: JSON.stringify({ username, password: "old123456", org_name: `O${rnd()}` }),
  }));
  const login = async (pw: string) => app.handle(new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: pw }),
  }));
  const token = (await (await login("old123456")).json()).data.token;
  const ch = await app.handle(new Request("http://localhost/api/auth/change-password", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ current_password: "old123456", new_password: "new123456" }),
  }));
  expect(ch.status).toBe(200);
  expect((await login("old123456")).status).toBe(401);
  expect((await login("new123456")).status).toBe(200);
});

test("P2/P3: bulk import, customer detail, reports, csv, audit, reminders", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const H = { ...hdr(m.token, org.id), "content-type": "application/json" };

  const bulk = await app.handle(new Request("http://localhost/api/customers/bulk", { method: "POST", headers: H, body: JSON.stringify({ rows: [{ customer_code: `B1${rnd()}` }, { customer_code: `B2${rnd()}` }] }) }));
  expect((await bulk.json()).data.created).toBe(2);

  const cust = (await (await app.handle(new Request("http://localhost/api/customers?limit=1", { headers: hdr(m.token, org.id) }))).json()).data.items[0];
  const det = await app.handle(new Request(`http://localhost/api/customers/${cust.id}/detail`, { headers: hdr(m.token, org.id) }));
  expect(det.status).toBe(200);
  expect((await det.json()).data).toHaveProperty("message_logs");

  const sum = await app.handle(new Request("http://localhost/api/reports/summary", { headers: hdr(m.token, org.id) }));
  const sumData = (await sum.json()).data;
  expect(sumData.customers).toBeGreaterThanOrEqual(2);
  expect(sumData.total_bill_amount).toBe(0);

  const plan = await makePlan(org.id, 490);
  const withOutstanding = await app.handle(new Request("http://localhost/api/reports/summary", { headers: hdr(m.token, org.id) }));
  expect((await withOutstanding.json()).data.total_bill_amount).toBe(490);
  const charts = await app.handle(new Request(`http://localhost/api/reports/dashboard-charts?period=month&year=${today.getUTCFullYear()}&month=${today.getUTCMonth() + 1}`, { headers: hdr(m.token, org.id) }));
  const chartData = (await charts.json()).data;
  expect(chartData.pie.uncollected).toBe(490);
  expect(chartData.monthly[today.getUTCMonth()].total).toBe(490);
  await prisma.billPlan.update({ where: { id: plan.plan.id }, data: { status: "cancelled" } });
  const withoutCancelled = await app.handle(new Request("http://localhost/api/reports/summary", { headers: hdr(m.token, org.id) }));
  expect((await withoutCancelled.json()).data.total_bill_amount).toBe(0);

  const csv = await app.handle(new Request("http://localhost/api/reports/payments.csv", { headers: hdr(m.token, org.id) }));
  expect(csv.headers.get("content-type")).toContain("text/csv");

  const au = await app.handle(new Request("http://localhost/api/audit-logs", { headers: hdr(m.token, org.id) }));
  expect((await au.json()).data.total).toBeGreaterThanOrEqual(1); // bulk import logged

  const rem = await app.handle(new Request("http://localhost/api/installments/send-reminders", { method: "POST", headers: H }));
  expect(rem.status).toBe(200);
});

test("customer profile and private document upload are org-scoped", async () => {
  const org = await mkOrg("customer-files");
  const member = await mkMember(org.id, "user");
  const customer = await prisma.customer.create({ data: { orgId: org.id, customerCode: `DOC${rnd()}` } });
  const H = hdr(member.token, org.id);

  const patch = await app.handle(new Request(`http://localhost/api/customers/${customer.id}`, {
    method: "PATCH",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ facebook_url: "https://facebook.com/example", email: "customer@example.com", address: "Bangkok", contact_note: "โทรช่วงเย็น" }),
  }));
  expect(patch.status).toBe(200);
  expect((await patch.json()).data.facebook_url).toBe("https://facebook.com/example");

  const form = new FormData();
  form.append("document_type", "identity");
  form.append("title", "หลักฐานทดสอบ");
  form.append("file", new File(["test-document"], "proof.pdf", { type: "application/pdf" }));
  const upload = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/documents`, { method: "POST", headers: H, body: form }));
  expect(upload.status).toBe(200);
  const uploaded = (await upload.json()).data;
  expect(uploaded.document_type).toBe("identity");
  expect(uploaded.original_file_name).toBe("proof.pdf");

  const detail = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/detail`, { headers: H }));
  const detailData = (await detail.json()).data;
  expect(detailData.customer.email).toBe("customer@example.com");
  expect(detailData.documents).toHaveLength(1);

  const file = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/documents/${uploaded.id}/file`, { headers: H }));
  expect(file.status).toBe(200);
  expect(await file.text()).toBe("test-document");

  const otherOrg = await mkOrg("other-customer-files");
  const otherMember = await mkMember(otherOrg.id, "user");
  const cross = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/documents/${uploaded.id}/file`, { headers: hdr(otherMember.token, otherOrg.id) }));
  expect(cross.status).toBe(404);

  await deleteSlipFile(uploaded.file_url);
});

test("health open; bare /api/customers needs auth", async () => {
  expect((await app.handle(new Request("http://localhost/health"))).status).toBe(200);
  expect((await app.handle(new Request("http://localhost/ready"))).status).toBe(200);
  expect((await app.handle(new Request("http://localhost/api/customers"))).status).toBe(401);
});

test("bill plans list returns all org bills with active plans first", async () => {
  const org = await mkOrg();
  const member = await mkMember(org.id, "user");
  const active = await makePlan(org.id, 490);
  const completed = await makePlan(org.id, 750);
  await prisma.billPlan.update({ where: { id: completed.plan.id }, data: { status: "completed" } });

  const res = await app.handle(new Request("http://localhost/api/bill-plans", { headers: hdr(member.token, org.id) }));
  expect(res.status).toBe(200);
  const plans = (await res.json()).data;
  expect(plans).toHaveLength(2);
  expect(plans[0].id).toBe(active.plan.id);
  expect(plans[0].status).toBe("active");
  expect(plans[0].customer).toHaveProperty("id", active.customer.id);
});

// ---------- platform settings + new features ----------
async function mkPlatformAdmin() {
  const u = await prisma.adminUser.create({ data: { username: `pa-${rnd()}`, isPlatformAdmin: true, isActive: true } });
  return signJwt({ sub: u.id }, env.jwtSecret);
}

test("platform settings: PATCH then GET round-trips; member is blocked", async () => {
  const token = await mkPlatformAdmin();
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const footer = `sys-${rnd()}`;
  await app.handle(new Request("http://localhost/api/platform/settings", { method: "PATCH", headers: H, body: JSON.stringify({ default_bill_footer: footer }) }));
  const got = await (await app.handle(new Request("http://localhost/api/platform/settings", { headers: H }))).json();
  expect(got.data.default_bill_footer).toBe(footer);

  // a normal member must not reach platform routes
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const blocked = await app.handle(new Request("http://localhost/api/platform/settings", { headers: hdr(m.token, org.id) }));
  expect(blocked.status).toBe(403);
});

test("bill footer falls back to system default when org has none", async () => {
  const { updateSystemSettings } = await import("../src/services/systemSettings");
  const footer = `deffoot-${rnd()}`;
  await updateSystemSettings({ defaultBillFooter: footer });
  const { renderPlanBill } = await import("../src/services/bill");
  const org = await mkOrg(); // org.billFooter is null
  const { plan } = await makePlan(org.id);
  const { text } = await renderPlanBill(prisma, plan.id);
  expect(text).toContain(footer);
});

test("org PATCH renames + toggles active (platform admin)", async () => {
  const token = await mkPlatformAdmin();
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const org = await mkOrg();
  const r = await (await app.handle(new Request(`http://localhost/api/platform/organizations/${org.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ name: "Renamed", is_active: false }) }))).json();
  expect(r.data.name).toBe("Renamed");
  expect(r.data.is_active).toBe(false);
});

test("manual payment marks installment paid + completes plan", async () => {
  const { recordManualPayment } = await import("../src/services/payment");
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const { plan, inst } = await makePlan(org.id, 490);
  const r = await recordManualPayment(inst.id, 490, m.user.id, org.id, "cash");
  expect(r.status).toBe("paid");
  const after = await prisma.billInstallment.findUnique({ where: { id: inst.id } });
  expect(after?.status).toBe("paid");
  const p = await prisma.billPlan.findUnique({ where: { id: plan.id } });
  expect(p?.status).toBe("completed");
});

test("customerBalance sums unpaid installments", async () => {
  const { customerBalance } = await import("../src/routes/line");
  const org = await mkOrg();
  const { customer } = await makePlan(org.id, 490);
  const b = await customerBalance(customer.id);
  expect(b.count).toBe(1);
  expect(b.outstanding).toBe(490);
  expect(b.nextDue).not.toBeNull();
});

test("LINE balance reply requires the exact ยอด command", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer } = await makePlan(org.id, 490, oa.id);
  const res = await webhook(oa.id, {
    events: [{
      type: "message",
      source: { type: "user", userId: customer.lineUserId },
      message: { type: "text", id: `balance-text-${rnd()}`, text: "มียอดไหมค่ะวันนี้" },
    }],
  });

  expect(res.status).toBe(200);
  const reply = await prisma.messageLog.findFirst({
    where: { orgId: org.id, customerId: customer.id, direction: "outbound" },
    orderBy: { sentAt: "desc" },
  });
  expect(reply?.messageType).toBe("text_help");

  await webhook(oa.id, {
    events: [{
      type: "message",
      source: { type: "user", userId: customer.lineUserId },
      message: { type: "text", id: `balance-exact-${rnd()}`, text: "ยอด" },
    }],
  });
  expect(await prisma.messageLog.count({ where: { orgId: org.id, customerId: customer.id, direction: "outbound", messageType: "balance_inquiry" } })).toBe(1);
});

test("custom message reply requires the exact trigger text", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer } = await makePlan(org.id, 490, oa.id);
  const member = await mkMember(org.id, "user");
  const setting = await app.handle(new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { ...hdr(member.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ message_templates: {
      custom_messages: [{ id: "hours", name: "เวลาทำการ", trigger: "เวลาทำการ", text: "เปิด 08:00-17:00" }],
    } }),
  }));
  expect(setting.status).toBe(200);

  for (const [id, text] of [["custom-contains", "ขอทราบเวลาทำการวันนี้"], ["custom-exact", "เวลาทำการ"]]) {
    const res = await webhook(oa.id, {
      events: [{
        type: "message",
        source: { type: "user", userId: customer.lineUserId },
        message: { type: "text", id, text },
      }],
    });
    expect(res.status).toBe(200);
  }

  const replies = await prisma.messageLog.findMany({
    where: { orgId: org.id, customerId: customer.id, direction: "outbound" },
    orderBy: { sentAt: "asc" },
  });
  expect(replies.filter((reply) => reply.messageType === "text_help")).toHaveLength(1);
  expect(replies.filter((reply) => reply.messageType === "custom_hours")).toHaveLength(1);
});

test("LINE bill menu replies with active unpaid bill details", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer } = await makePlan(org.id, 490, oa.id);
  const member = await mkMember(org.id, "user");
  const setting = await app.handle(new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { ...hdr(member.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ message_templates: { customer_bills: "📋 รายการบิลค้างจ่าย\n\n{bill_text}" } }),
  }));
  expect(setting.status).toBe(200);
  const res = await webhook(oa.id, {
    events: [{
      type: "message",
      source: { type: "user", userId: customer.lineUserId },
      message: { type: "text", id: `bill-${rnd()}`, text: "บิล" },
    }],
  });

  expect(res.status).toBe(200);
  const reply = await prisma.messageLog.findFirst({
    where: { direction: "outbound", messageType: "bill_inquiry", customerId: customer.id },
    orderBy: { sentAt: "desc" },
  });
  expect(reply?.messageText).toContain("บิล 1️⃣");
  expect(reply?.messageText).toContain("📋 รายการบิลค้างจ่าย");
  expect(reply?.messageText).toContain("💸 490");
  expect(reply?.messageText).toContain("จบ🙏");
});

test("disabled LINE response is not sent", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer } = await makePlan(org.id, 490, oa.id);
  const member = await mkMember(org.id, "user");
  const setting = await app.handle(new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { ...hdr(member.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ message_templates: { enabled: { customer_bills: false } } }),
  }));
  expect(setting.status).toBe(200);
  expect((await setting.json()).data.message_templates.enabled.customer_bills).toBe(false);

  const res = await webhook(oa.id, {
    events: [{
      type: "message",
      source: { type: "user", userId: customer.lineUserId },
      message: { type: "text", id: `disabled-${rnd()}`, text: "บิล" },
    }],
  });

  expect(res.status).toBe(200);
  expect(await prisma.messageLog.count({ where: { orgId: org.id, direction: "outbound", messageType: "bill_inquiry" } })).toBe(0);
});

// ---------- slip retention / purge ----------

test("effectiveRetentionDays: org override > system default > env default; 0 is a real value", async () => {
  const { updateSystemSettings } = await import("../src/services/systemSettings");
  await updateSystemSettings({ defaultSlipRetentionDays: 14 });
  expect(await effectiveRetentionDays(null)).toBe(14); // no org override -> system default
  expect(await effectiveRetentionDays(undefined)).toBe(14);
  expect(await effectiveRetentionDays(7)).toBe(7); // org override wins
  expect(await effectiveRetentionDays(0)).toBe(0); // 0 is a real override, not "unset"

  await updateSystemSettings({ defaultSlipRetentionDays: null });
  expect(await effectiveRetentionDays(null)).toBe(env.slipRetentionDays); // falls back to env default
});

test("purgeSlipImage: clears image but keeps OCR/match metadata + image_hash, idempotent, audited", async () => {
  const org = await mkOrg();
  const oa = await mkOa(org.id);
  const { customer, inst } = await makePlan(org.id, 490, oa.id);
  const res = await webhook(oa.id, imageEvent(customer.lineUserId!, `pm${rnd()}`));
  expect(res.status).toBe(200);
  const sub = await prisma.paymentSubmission.findFirst({ where: { lineOaId: oa.id, customerId: customer.id }, orderBy: { createdAt: "desc" } });
  expect(sub!.imageUrl).toBeTruthy();
  expect(sub!.imageHash).toBeTruthy();
  const before = { ocrRawText: sub!.ocrRawText, parsedAmount: sub!.parsedAmount, matchStatus: sub!.matchStatus, reviewStatus: sub!.reviewStatus, imageHash: sub!.imageHash };

  const r1 = await purgeSlipImage(sub!.id);
  expect(r1.purged).toBe(true);
  const after = await prisma.paymentSubmission.findUnique({ where: { id: sub!.id } });
  expect(after!.imageUrl).toBeNull();
  expect(after!.imagePurgedAt).not.toBeNull();
  expect(after!.ocrRawText).toBe(before.ocrRawText);
  expect(after!.parsedAmount?.toString() ?? null).toBe(before.parsedAmount?.toString() ?? null);
  expect(after!.matchStatus).toBe(before.matchStatus);
  expect(after!.reviewStatus).toBe(before.reviewStatus);
  expect(after!.imageHash).toBe(before.imageHash); // duplicate detection still works post-purge

  const auditEntry = await prisma.auditLog.findFirst({ where: { entityType: "payment_submission", entityId: sub!.id, action: "purge_slip_image" } });
  expect(auditEntry).toBeTruthy();

  // idempotent: second call is a no-op, doesn't throw, doesn't re-purge
  const r2 = await purgeSlipImage(sub!.id);
  expect(r2.purged).toBe(false);
  expect(r2.reason).toBe("already_purged");
  void inst;
});

test("purgeSlipImage: never deletes a file outside the storage root, still clears the DB pointer safely", async () => {
  const org = await mkOrg();
  const { customer } = await makePlan(org.id);
  const sub = await prisma.paymentSubmission.create({
    data: { orgId: org.id, customerId: customer.id, imageUrl: "/etc/passwd", imageHash: `OUT${tag}${rnd()}`, ocrRawText: "raw" },
  });
  const r = await purgeSlipImage(sub.id);
  expect(r.purged).toBe(true); // DB pointer cleared, but...
  const { access } = await import("node:fs/promises");
  await access("/etc/passwd"); // ...the outside file is untouched
  const after = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(after!.ocrRawText).toBe("raw"); // metadata untouched either way
});

test("purgeSlipImage: missing submission / already-missing file never throws", async () => {
  const r = await purgeSlipImage("00000000-0000-0000-0000-000000000000");
  expect(r.purged).toBe(false);
  expect(r.reason).toBe("not_found");

  const org = await mkOrg();
  const { customer } = await makePlan(org.id);
  const sub = await prisma.paymentSubmission.create({
    data: { orgId: org.id, customerId: customer.id, imageUrl: `${env.localStoragePath}/slips/does-not-exist-${rnd()}.jpg`, imageHash: `MIS${tag}${rnd()}` },
  });
  const r2 = await purgeSlipImage(sub.id); // file already gone -> still succeeds, no crash
  expect(r2.purged).toBe(true);
  expect((await prisma.paymentSubmission.findUnique({ where: { id: sub.id } }))!.imageUrl).toBeNull();
});

test("purgeExpiredSlips: only purges submissions past each org's own retention cutoff", async () => {
  const orgShort = await mkOrg(); // 0-day retention -> everything with an image is eligible
  const orgLong = await mkOrg(); // 365-day retention -> nothing eligible yet
  await prisma.organization.update({ where: { id: orgShort.id }, data: { slipRetentionDays: 0 } });
  await prisma.organization.update({ where: { id: orgLong.id }, data: { slipRetentionDays: 365 } });
  const { customer: custShort } = await makePlan(orgShort.id);
  const { customer: custLong } = await makePlan(orgLong.id);
  const subShort = await prisma.paymentSubmission.create({
    data: { orgId: orgShort.id, customerId: custShort.id, imageUrl: `${env.localStoragePath}/slips/x-${rnd()}.jpg`, imageHash: `S${tag}${rnd()}` },
  });
  const subLong = await prisma.paymentSubmission.create({
    data: { orgId: orgLong.id, customerId: custLong.id, imageUrl: `${env.localStoragePath}/slips/y-${rnd()}.jpg`, imageHash: `L${tag}${rnd()}` },
  });

  await purgeExpiredSlips();
  expect((await prisma.paymentSubmission.findUnique({ where: { id: subShort.id } }))!.imageUrl).toBeNull();
  expect((await prisma.paymentSubmission.findUnique({ where: { id: subLong.id } }))!.imageUrl).not.toBeNull();
});

test("retention 0: webhook purges the slip immediately after OCR, metadata survives", async () => {
  const org = await mkOrg();
  await prisma.organization.update({ where: { id: org.id }, data: { slipRetentionDays: 0 } });
  const oa = await mkOa(org.id);
  const { customer } = await makePlan(org.id, 490, oa.id);
  const res = await webhook(oa.id, imageEvent(customer.lineUserId!, `z${rnd()}`));
  expect(res.status).toBe(200);
  const sub = await prisma.paymentSubmission.findFirst({ where: { lineOaId: oa.id, customerId: customer.id }, orderBy: { createdAt: "desc" } });
  expect(sub!.imageUrl).toBeNull(); // purged right after processing
  expect(sub!.imagePurgedAt).not.toBeNull();
  expect(sub!.imageHash).toBeTruthy(); // duplicate detection still intact
  expect(sub!.matchStatus).not.toBe("unmatched"); // matching already ran before purge
});

// ---------- bulk-approve ----------
test("bulk-approve: all succeed, payments created, installments paid", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");

  const { inst: inst1 } = await makePlan(org.id);
  const sub1 = await prisma.paymentSubmission.create({
    data: { orgId: org.id, matchedInstallmentId: inst1.id, parsedAmount: 490, parsedReferenceNo: `BK1${rnd()}` },
  });
  const { inst: inst2 } = await makePlan(org.id);
  const sub2 = await prisma.paymentSubmission.create({
    data: { orgId: org.id, matchedInstallmentId: inst2.id, parsedAmount: 490, parsedReferenceNo: `BK2${rnd()}` },
  });

  const res = await app.handle(new Request("http://localhost/api/admin/payment-submissions/bulk-approve", {
    method: "POST",
    headers: { ...hdr(m.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ ids: [sub1.id, sub2.id] }),
  }));
  expect(res.status).toBe(200);
  const data = (await res.json()).data;
  expect(data.approved).toHaveLength(2);
  expect(data.failed).toHaveLength(0);
  expect((await prisma.billInstallment.findUnique({ where: { id: inst1.id } }))!.status).toBe("paid");
  expect((await prisma.billInstallment.findUnique({ where: { id: inst2.id } }))!.status).toBe("paid");
});

test("bulk-approve: partial failure — bad submission does not fail the batch", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");

  const { inst } = await makePlan(org.id);
  const good = await prisma.paymentSubmission.create({
    data: { orgId: org.id, matchedInstallmentId: inst.id, parsedAmount: 490, parsedReferenceNo: `BKG${rnd()}` },
  });
  const bad = await prisma.paymentSubmission.create({
    data: { orgId: org.id },
  });

  const res = await app.handle(new Request("http://localhost/api/admin/payment-submissions/bulk-approve", {
    method: "POST",
    headers: { ...hdr(m.token, org.id), "content-type": "application/json" },
    body: JSON.stringify({ ids: [good.id, bad.id] }),
  }));
  expect(res.status).toBe(200);
  const data = (await res.json()).data;
  expect(data.approved).toHaveLength(1);
  expect(data.approved[0].id).toBe(good.id);
  expect(data.failed).toHaveLength(1);
  expect(data.failed[0].id).toBe(bad.id);
  expect(data.failed[0].reason).toMatch(/no matched installment/i);
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))!.status).toBe("paid");
});

test("bulk-approve: cross-org submissions are rejected as failures, not silently approved", async () => {
  const orgA = await mkOrg();
  const orgB = await mkOrg();
  const mB = await mkMember(orgB.id, "user");

  const { inst } = await makePlan(orgA.id);
  const sub = await prisma.paymentSubmission.create({
    data: { orgId: orgA.id, matchedInstallmentId: inst.id, parsedAmount: 490 },
  });

  const res = await app.handle(new Request("http://localhost/api/admin/payment-submissions/bulk-approve", {
    method: "POST",
    headers: { ...hdr(mB.token, orgB.id), "content-type": "application/json" },
    body: JSON.stringify({ ids: [sub.id] }),
  }));
  expect(res.status).toBe(200);
  const data = (await res.json()).data;
  expect(data.approved).toHaveLength(0);
  expect(data.failed).toHaveLength(1);
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))!.status).not.toBe("paid");
});
