import { test, expect } from "bun:test";
import { prisma } from "../src/lib/prisma";
import { bangkokToday } from "../src/lib/date";
import { processSubmission, approveSubmission, matchInstallment, rejectSubmission } from "../src/services/payment";
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

test("cash bill is never auto-matched (routed to admin)", async () => {
  const org = await mkOrg();
  const { customer } = await makePlan(org.id, 490);
  // amount+date would normally auto-match, but docType=cash must force admin review
  const sub = await prisma.paymentSubmission.create({
    data: { orgId: org.id, customerId: customer.id, docType: "cash", parsedAmount: 490, parsedTransferDate: today, parsedReferenceNo: `RC${rnd()}`, imageHash: `HC${rnd()}`, ocrStatus: "success" },
  });
  await processSubmission(sub.id);
  const after = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(after?.matchStatus).toBe("needs_admin_match");
  expect(after?.matchedInstallmentId).toBeNull();
});

test("storeSlip (local) writes to orgId/lineOaId path", async () => {
  const { updateSystemSettings } = await import("../src/services/systemSettings");
  await updateSystemSettings({ storageDriver: "local" });
  const { storeSlip } = await import("../src/services/storage");
  const p = await storeSlip("orgX", "oaY", `sub-${rnd()}`, Buffer.from("slip"), "jpg");
  expect(p).toContain("orgX/oaY/");
  expect(await Bun.file(p).exists()).toBe(true);
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

test("slip image endpoint serves local file, org-scoped", async () => {
  const org = await mkOrg();
  const other = await mkOrg();
  const m = await mkMember(org.id, "user");
  const mOther = await mkMember(other.id, "user");
  const { storeSlip } = await import("../src/services/storage");
  const path = await storeSlip(org.id, null, `img-${rnd()}`, Buffer.from("fake-jpg-bytes"), "jpg");
  const sub = await prisma.paymentSubmission.create({ data: { orgId: org.id, imageUrl: path } });

  const url = `http://localhost/api/admin/payment-submissions/${sub.id}/image`;
  const okRes = await app.handle(new Request(url, { headers: hdr(m.token, org.id) }));
  expect(okRes.status).toBe(200);
  expect(await okRes.text()).toBe("fake-jpg-bytes");

  // Another org must not see it.
  const cross = await app.handle(new Request(url, { headers: hdr(mOther.token, other.id) }));
  expect(cross.status).toBe(404);
});

test("auto-approve setting: auto_matched slip becomes paid without admin", async () => {
  const org = await prisma.organization.create({ data: { name: `auto-${rnd()}`, autoApproveEnabled: true } });
  const { inst, customer } = await makePlan(org.id, 750);
  const sub = await prisma.paymentSubmission.create({
    data: { orgId: org.id, customerId: customer.id, parsedAmount: 750, parsedTransferDate: today, parsedReferenceNo: `AUTO${rnd()}`, ocrStatus: "success", docType: "slip" },
  });
  await processSubmission(sub.id);
  const s = await prisma.paymentSubmission.findUnique({ where: { id: sub.id } });
  expect(s!.reviewStatus).toBe("approved");
  expect(s!.reviewedBy).toBe("system");
  expect((await prisma.billInstallment.findUnique({ where: { id: inst.id } }))!.status).toBe("paid");

  // Cash bill never auto-approves, even with the setting on.
  const cash = await prisma.paymentSubmission.create({
    data: { orgId: org.id, customerId: customer.id, parsedAmount: 750, parsedTransferDate: today, docType: "cash", ocrStatus: "success" },
  });
  await processSubmission(cash.id);
  expect((await prisma.paymentSubmission.findUnique({ where: { id: cash.id } }))!.reviewStatus).toBe("pending_review");
});
