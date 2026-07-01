import { test, expect } from "bun:test";
import { prisma } from "../src/lib/prisma";
import { bangkokToday } from "../src/lib/date";
import { processSubmission, approveSubmission, matchInstallment, rejectSubmission } from "../src/services/payment";
import { effectiveRetentionDays, purgeSlipImage, purgeExpiredSlips } from "../src/services/retention";
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

async function makePlan(orgId: string, amount = 490) {
  const bank = await prisma.bankAccount.create({
    data: { orgId, accountName: "n", accountNo: "1", bankName: "b", isDefault: true, isActive: true },
  });
  const customer = await prisma.customer.create({ data: { orgId, customerCode: `C${rnd()}`, status: "active" } });
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

// ---------- collection follow-up workflow ----------
test("collection: add note creates timeline entry + upserts current follow-up state", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const { customer } = await makePlan(org.id);
  const H = { ...hdr(m.token, org.id), "content-type": "application/json" };

  const add = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/collection-activities`, {
    method: "POST", headers: H, body: JSON.stringify({ status: "contacted", note: "โทรแล้วไม่รับสาย" }),
  }));
  expect(add.status).toBe(200);
  const added = (await add.json()).data;
  expect(added.activity.note).toBe("โทรแล้วไม่รับสาย");
  expect(added.follow_up.status).toBe("contacted");

  const get = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/collection-activities`, { headers: hdr(m.token, org.id) }));
  const got = (await get.json()).data;
  expect(got.follow_up.status).toBe("contacted");
  expect(got.activities.length).toBe(1);

  const auditEntry = await prisma.auditLog.findFirst({ where: { entityType: "customer", entityId: customer.id, action: "add_collection_activity" } });
  expect(auditEntry).toBeTruthy();

  // payment/installment status untouched by the follow-up note
  const inst = await prisma.billInstallment.findFirst({ where: { billPlan: { customerId: customer.id } } });
  expect(inst!.status).toBe("pending");
});

test("collection: promise-to-pay date, snooze date, and assignment round-trip; invalid status rejected", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const { customer } = await makePlan(org.id);
  const H = { ...hdr(m.token, org.id), "content-type": "application/json" };

  const promiseDate = "2026-08-01";
  const snoozeDate = "2026-07-10";
  const set = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/collection-activities`, {
    method: "POST", headers: H,
    body: JSON.stringify({ status: "promised_to_pay", promise_to_pay_date: promiseDate, next_follow_up_date: snoozeDate, assigned_to_id: m.user.id }),
  }));
  expect(set.status).toBe(200);
  const followUp = (await set.json()).data.follow_up;
  expect(followUp.promise_to_pay_date).toBe(promiseDate);
  expect(followUp.next_follow_up_date).toBe(snoozeDate);
  expect(followUp.assigned_to_id).toBe(m.user.id);

  const bad = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/collection-activities`, {
    method: "POST", headers: H, body: JSON.stringify({ status: "not_a_real_status" }),
  }));
  expect(bad.status).toBe(400);

  const empty = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/collection-activities`, {
    method: "POST", headers: H, body: JSON.stringify({}),
  }));
  expect(empty.status).toBe(400);

  // assigning to a non-member of this org is rejected
  const outsider = await prisma.adminUser.create({ data: { username: `out${rnd()}`, isActive: true } });
  const badAssign = await app.handle(new Request(`http://localhost/api/customers/${customer.id}/collection-activities`, {
    method: "POST", headers: H, body: JSON.stringify({ assigned_to_id: outsider.id }),
  }));
  expect(badAssign.status).toBe(400);
});

test("collection: filter customers by follow-up status, and org-wide follow-up queue", async () => {
  const org = await mkOrg();
  const m = await mkMember(org.id, "user");
  const a = await makePlan(org.id);
  const b = await makePlan(org.id);
  const H = { ...hdr(m.token, org.id), "content-type": "application/json" };

  await app.handle(new Request(`http://localhost/api/customers/${a.customer.id}/collection-activities`, {
    method: "POST", headers: H, body: JSON.stringify({ status: "dispute", note: "แจ้งว่าจ่ายแล้ว" }),
  }));

  const filtered = await app.handle(new Request(`http://localhost/api/customers?limit=100&follow_up_status=dispute`, { headers: hdr(m.token, org.id) }));
  const filteredItems = (await filtered.json()).data.items;
  expect(filteredItems.some((c: any) => c.id === a.customer.id)).toBe(true);
  expect(filteredItems.some((c: any) => c.id === b.customer.id)).toBe(false);

  const queue = await app.handle(new Request(`http://localhost/api/collection/follow-ups?status=dispute`, { headers: hdr(m.token, org.id) }));
  const queueData = (await queue.json()).data;
  expect(queueData.length).toBe(1);
  expect(queueData[0].customer.id).toBe(a.customer.id);
});

// ---------- TENANT ISOLATION: collection follow-up ----------
test("collection tenant isolation: cannot read/write follow-up data for another org's customer", async () => {
  const orgA = await mkOrg();
  const orgB = await mkOrg();
  const { customer: custA } = await makePlan(orgA.id);
  const memberB = await mkMember(orgB.id, "user");
  const HB = { ...hdr(memberB.token, orgB.id), "content-type": "application/json" };

  // memberB scoped to orgB cannot see/add activity on orgA's customer
  const read = await app.handle(new Request(`http://localhost/api/customers/${custA.id}/collection-activities`, { headers: hdr(memberB.token, orgB.id) }));
  expect(read.status).toBe(404);
  const write = await app.handle(new Request(`http://localhost/api/customers/${custA.id}/collection-activities`, {
    method: "POST", headers: HB, body: JSON.stringify({ note: "cross-tenant attempt" }),
  }));
  expect(write.status).toBe(404);

  // seed a follow-up in orgA, confirm org-wide queue for orgB never returns it
  const memberA = await mkMember(orgA.id, "user");
  await app.handle(new Request(`http://localhost/api/customers/${custA.id}/collection-activities`, {
    method: "POST", headers: { ...hdr(memberA.token, orgA.id), "content-type": "application/json" }, body: JSON.stringify({ status: "unreachable" }),
  }));
  const queueB = await app.handle(new Request(`http://localhost/api/collection/follow-ups`, { headers: hdr(memberB.token, orgB.id) }));
  const queueBData = (await queueB.json()).data;
  expect(queueBData.every((f: any) => f.customer.id !== custA.id)).toBe(true);
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
  expect((await sum.json()).data.customers).toBeGreaterThanOrEqual(2);

  const csv = await app.handle(new Request("http://localhost/api/reports/payments.csv", { headers: hdr(m.token, org.id) }));
  expect(csv.headers.get("content-type")).toContain("text/csv");

  const au = await app.handle(new Request("http://localhost/api/audit-logs", { headers: hdr(m.token, org.id) }));
  expect((await au.json()).data.total).toBeGreaterThanOrEqual(1); // bulk import logged

  const rem = await app.handle(new Request("http://localhost/api/installments/send-reminders", { method: "POST", headers: H }));
  expect(rem.status).toBe(200);
});

test("health open; bare /api/customers needs auth", async () => {
  expect((await app.handle(new Request("http://localhost/health"))).status).toBe(200);
  expect((await app.handle(new Request("http://localhost/api/customers"))).status).toBe(401);
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
  const { customer, inst } = await makePlan(org.id);
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
  await expect(access("/etc/passwd")).resolves.toBeUndefined(); // ...the outside file is untouched
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
  const { customer } = await makePlan(org.id);
  const res = await webhook(oa.id, imageEvent(customer.lineUserId!, `z${rnd()}`));
  expect(res.status).toBe(200);
  const sub = await prisma.paymentSubmission.findFirst({ where: { lineOaId: oa.id, customerId: customer.id }, orderBy: { createdAt: "desc" } });
  expect(sub!.imageUrl).toBeNull(); // purged right after processing
  expect(sub!.imagePurgedAt).not.toBeNull();
  expect(sub!.imageHash).toBeTruthy(); // duplicate detection still intact
  expect(sub!.matchStatus).not.toBe("unmatched"); // matching already ran before purge
});
