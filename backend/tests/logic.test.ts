import { test, expect } from "bun:test";
import { generateInstallments } from "../src/services/bill";
import { toEmojiNumber } from "../src/lib/emoji-number";
import { renderBillStatusLines, renderDailyReminder, renderBillText, renderGroupedBillText } from "../src/services/messages";
import { scoreInstallment, decideMatch } from "../src/services/matching";
import { mapGeminiResult, detectImageMime } from "../src/services/ocr";
import { deleteSlipFile } from "../src/services/storage";
import { bangkokDayEndExclusive, bangkokDayStart, dateOnly, toISODate } from "../src/lib/date";
import { verifySignature } from "../src/lib/line";
import { signJwt, verifyJwt } from "../src/lib/jwt";
import { createHmac } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../src/env";

test("jwt: roundtrip, tamper, wrong-secret, expiry", () => {
  const secret = "test-secret";
  const tok = signJwt({ sub: "u1", role: "admin" }, secret);
  const p = verifyJwt(tok, secret);
  expect(p.sub).toBe("u1");
  expect(p.role).toBe("admin");
  expect(() => verifyJwt(tok, "wrong")).toThrow();
  expect(() => verifyJwt(tok.slice(0, -2) + "xy", secret)).toThrow();
  expect(() => verifyJwt(signJwt({ sub: "u" }, secret, -10), secret)).toThrow(/expired/);
});

test("generateInstallments: 7-day cycle, 3 installments", () => {
  const rows = generateInstallments(dateOnly("2026-06-16"), 7, 3, 490);
  expect(rows.map((r) => toISODate(r.dueDate))).toEqual(["2026-06-16", "2026-06-23", "2026-06-30"]);
  expect(rows.every((r) => r.amountDue === 490)).toBe(true);
});

test("generateInstallments: rejects bad input", () => {
  expect(() => generateInstallments(dateOnly("2026-06-16"), 0, 3, 490)).toThrow();
  expect(() => generateInstallments(dateOnly("2026-06-16"), 7, 0, 490)).toThrow();
  expect(() => generateInstallments(dateOnly("2026-06-16"), 7, 3, 0)).toThrow();
});

test("Bangkok date filters use the correct UTC boundaries", () => {
  expect(bangkokDayStart("2026-08-14").toISOString()).toBe("2026-08-13T17:00:00.000Z");
  expect(bangkokDayEndExclusive("2026-08-14").toISOString()).toBe("2026-08-14T17:00:00.000Z");
});

test("toEmojiNumber", () => {
  expect(toEmojiNumber("16")).toBe("1️⃣6️⃣");
  expect(toEmojiNumber(69)).toBe("6️⃣9️⃣");
});

test("renderBillStatusLines: 💸 stays, ✅ appended when paid", () => {
  const lines = renderBillStatusLines([
    { dueDate: dateOnly("2026-06-15"), amountDue: 490, status: "paid" },
    { dueDate: dateOnly("2026-06-22"), amountDue: 490, status: "paid" },
    { dueDate: dateOnly("2026-06-29"), amountDue: 490, status: "pending" },
  ]);
  expect(lines).toBe("15💸 490✅\n22💸 490✅\n29💸 490");
});

test("renderBillText: uses note verbatim + bank from DB", () => {
  const text = renderBillText({
    billNo: 2,
    principal: 1000,
    installmentAmount: 490,
    cycleDays: 7,
    totalInstallments: 3,
    note: "ต้น 1000ส่ง490ทุก7วัน 3งวดจบ",
    installments: [
      { dueDate: dateOnly("2026-06-15"), amountDue: 490, status: "paid" },
      { dueDate: dateOnly("2026-06-22"), amountDue: 490, status: "paid" },
      { dueDate: dateOnly("2026-06-29"), amountDue: 490, status: "pending" },
    ],
    bank: { accountNo: "2509480357", bankName: "ธนาคารกรุงศรีอยุธยา", accountName: "ชลดา พรมเมศ" },
  });
  expect(text).toContain("บิล 2️⃣");
  expect(text).toContain("ต้น 1000ส่ง490ทุก7วัน 3งวดจบ");
  expect(text).toContain("15💸 490✅\n22💸 490✅\n29💸 490");
  expect(text).toContain("จบ🙏");
  expect(text).toContain("เลขที่บัญชี 2509480357");
});

test("renderBillText: preview follows the sample bill layout", () => {
  const text = renderBillText({
    billNo: 16,
    principal: 8850,
    installmentAmount: 500,
    cycleDays: 10,
    totalInstallments: 18,
    note: "ยอด 8850 ส่ง500ราย10วัน",
    installments: [
      { dueDate: dateOnly("2026-05-28"), amountDue: 500, status: "paid" },
      { dueDate: dateOnly("2026-06-01"), amountDue: 500, status: "pending" },
      { dueDate: dateOnly("2026-06-11"), amountDue: 500, status: "paid" },
    ],
    bank: { accountNo: "2509480357", bankName: "ธนาคารกรุงศรีอยุธยา", accountName: "ชลดา พรมเมศ" },
    footer: "‼️ชำระห้ามเกินเวลา 17.00น  เกินเวลา ปรับ ชม ละ500บาท และแบล็คลิสถาวร 📌",
  });
  expect(text).toBe(
    "บิล 1️⃣6️⃣\n\nยอด 8850 ส่ง500ราย10วัน\n\n" +
    "28💸 500✅\n1💸 500\n11💸 500✅\n\nจบ🙏\n\n" +
    "💸 ช่องทางการโอนเงิน 💸\n\nเลขที่บัญชี 2509480357\nธนาคารกรุงศรีอยุธยา\nชื่อบัญชี ชลดา พรมเมศ" +
    "\n\n‼️ชำระห้ามเกินเวลา 17.00น  เกินเวลา ปรับ ชม ละ500บาท และแบล็คลิสถาวร 📌"
  );
});

test("renderGroupedBillText: open plans share one bill header, bank, and footer", () => {
  const bank = { accountNo: "2509480357", bankName: "ธนาคารกรุงศรีอยุธยา", accountName: "ชลดา พรมเมศ" };
  const text = renderGroupedBillText({
    billNo: 8,
    plans: [
      {
        principal: 8000,
        installmentAmount: 2334,
        cycleDays: 15,
        totalInstallments: 6,
        note: "ต้น8000ส่ง2334ราย15 วัน 6งวดจบ",
        installments: [
          { dueDate: dateOnly("2026-05-23"), amountDue: 2334, status: "paid" },
          { dueDate: dateOnly("2026-06-07"), amountDue: 2334, status: "pending", penaltyAmount: 1500 },
        ],
        bank,
      },
      {
        principal: 1000,
        installmentAmount: 300,
        cycleDays: 7,
        totalInstallments: 11,
        note: "ต้น 1000 คืน 1300 ระยะเวลา7วัน",
        installments: [{ dueDate: dateOnly("2026-06-06"), amountDue: 300, status: "paid" }],
        bank,
      },
    ],
    footer: "footer",
  });

  expect(text).toContain("บิล 8️⃣\n\nต้น8000ส่ง2334ราย15 วัน 6งวดจบ");
  expect(text).toContain("จบ🙏\n\nต้น 1000 คืน 1300 ระยะเวลา7วัน");
  expect(text.match(/💸 ช่องทางการโอนเงิน 💸/g)).toHaveLength(1);
  expect(text.endsWith("\n\nfooter")).toBe(true);
});

test("renderBillText: renders per-installment and bill-header penalties separately", () => {
  const text = renderBillText({
    billNo: 16,
    principal: 8850,
    installmentAmount: 500,
    cycleDays: 10,
    totalInstallments: 2,
    billPenaltyAmount: 500,
    installments: [
      { dueDate: dateOnly("2026-05-12"), amountDue: 500, status: "paid", penaltyAmount: 500 },
      { dueDate: dateOnly("2026-05-22"), amountDue: 500, status: "pending" },
    ],
    bank: null,
    footer: "footer",
  });
  expect(text).toContain("12💸 500✅🔴ปรับ500");
  expect(text).toContain("22💸 500");
  expect(text).toContain("🔴ค่าปรับหัวบิล 500");
});

test("renderBillText: per-org footer overrides default", () => {
  const base = { billNo: 1, principal: 1000, installmentAmount: 490, cycleDays: 7, totalInstallments: 1, bank: null,
    installments: [{ dueDate: dateOnly("2026-06-16"), amountDue: 490, status: "pending" }] };
  expect(renderBillText({ ...base, footer: "ห้ามเกิน 18.00 น." })).toContain("ห้ามเกิน 18.00 น.");
  expect(renderBillText({ ...base, footer: "  " })).toContain("กรุณาชำระภายในเวลา"); // blank -> default
});

test("renderDailyReminder contains emoji date", () => {
  const msg = renderDailyReminder(dateOnly("2026-06-16"));
  expect(msg).toContain("1️⃣6️⃣ มิถุนายน 6️⃣9️⃣");
  expect(msg).toContain("17.00");
});

test("scoreInstallment: full match (amount + date + due-today bonus) = 95", () => {
  const today = dateOnly("2026-06-16");
  const c = { id: "x", amountDue: 490, dueDate: dateOnly("2026-06-16") };
  const score = scoreInstallment({ amount: 490, transferDate: dateOnly("2026-06-16") }, c, { today });
  expect(score).toBe(95);
});

test("scoreInstallment: destination account no matches -> bonus; mismatches -> penalty", () => {
  const today = dateOnly("2026-01-01");
  const c = { id: "x", amountDue: 490, dueDate: dateOnly("2026-06-16"), bankAccountNo: "250-9-48035-7" };
  const slipSame = { amount: 490, transferDate: dateOnly("2026-06-16"), accountNo: "2509480357" };
  const slipDiff = { amount: 490, transferDate: dateOnly("2026-06-16"), accountNo: "9999999999" };
  const scoreMatch = scoreInstallment(slipSame, c, { today });
  const scoreMismatch = scoreInstallment(slipDiff, c, { today });
  expect(scoreMatch).toBeGreaterThan(scoreMismatch);
});

test("decideMatch: auto when score high and unique best", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch(
    { amount: 490, transferDate: dateOnly("2026-06-16") },
    [{ id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") }],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("auto_matched");
  expect(d.installmentId).toBe("i1");
});

test("decideMatch: amount exact + transfer date within ±1 day of due date still auto matches", () => {
  const today = dateOnly("2026-07-01");
  const d = decideMatch(
    { amount: 490, transferDate: dateOnly("2026-06-15") },
    [{ id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") }],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("auto_matched");
  expect(d.installmentId).toBe("i1");
});

test("decideMatch: needs admin when date mismatch is beyond tolerance", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch(
    { amount: 490, transferDate: dateOnly("2026-06-10") },
    [{ id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") }],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("needs_admin_match");
});

test("decideMatch: small fee/rounding difference in amount does not auto-approve", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch(
    { amount: 465, transferDate: dateOnly("2026-06-16") }, // 490 due, 25 off = outside tolerance
    [{ id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") }],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("needs_admin_match");
});

test("decideMatch: destination account no confirms the right candidate among same-amount installments", () => {
  const today = dateOnly("2026-01-01");
  const d = decideMatch(
    { amount: 490, transferDate: dateOnly("2026-06-16"), accountNo: "1112223334" },
    [
      { id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16"), bankAccountNo: "1112223334" },
      { id: "i2", amountDue: 490, dueDate: dateOnly("2026-06-16"), bankAccountNo: "9998887776" },
    ],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("auto_matched");
  expect(d.installmentId).toBe("i1");
});

test("decideMatch: needs admin when two equal-amount installments tie", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch(
    { amount: 490, transferDate: null },
    [
      { id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-23") },
      { id: "i2", amountDue: 490, dueDate: dateOnly("2026-06-30") },
    ],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("needs_admin_match");
  expect(d.topCandidates.length).toBe(2);
});

test("decideMatch: duplicate reference/image still blocks auto match even with a perfect score", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch(
    { amount: 490, transferDate: dateOnly("2026-06-16") },
    [{ id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") }],
    { today, referenceUnique: false, customerKnown: true }
  );
  expect(d.status).toBe("needs_admin_match");
  expect(d.installmentId).toBeNull();
  expect(d.reason).toMatch(/ซ้ำ/);
});

test("decideMatch: no customer -> needs admin", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch({ amount: 490, transferDate: today }, [], {
    today,
    referenceUnique: true,
    customerKnown: false,
  });
  expect(d.status).toBe("needs_admin_match");
});

test("decideMatch: slip amount matches the sum of two pending installments -> multi-installment reason", () => {
  const today = dateOnly("2026-01-01");
  const d = decideMatch(
    { amount: 980, transferDate: dateOnly("2026-06-16") },
    [
      { id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") },
      { id: "i2", amountDue: 490, dueDate: dateOnly("2026-06-23") },
    ],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("needs_admin_match");
  expect(d.reason).toMatch(/หลายงวด/);
});

test("mapGeminiResult: coerces types, nulls -> undefined", () => {
  const r = mapGeminiResult(
    { amount: "490", transferDate: "2026-06-16", referenceNo: "", accountNo: null, confidence: 92 },
    "{raw}"
  );
  expect(r.amount).toBe(490);
  expect(r.transferDate).toBe("2026-06-16");
  expect(r.referenceNo).toBeUndefined();
  expect(r.accountNo).toBeUndefined();
  expect(r.confidence).toBe(92);
  expect(r.rawText).toBe("{raw}");
});

test("detectImageMime: real images pass, junk rejected", () => {
  expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
  expect(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/png");
  expect(detectImageMime(Buffer.from("RIFF1234WEBP"))).toBe("image/webp");
  expect(detectImageMime(Buffer.from("not an image at all"))).toBeNull();
  expect(detectImageMime(Buffer.from("tiny"))).toBeNull();
});

test("verifySignature: valid sig passes, wrong/missing fails", () => {
  const secret = "s3cr3t";
  const body = '{"events":[]}';
  const sig = createHmac("sha256", secret).update(body).digest("base64");
  expect(verifySignature(body, sig, secret)).toBe(true);
  expect(verifySignature(body, "wrong", secret)).toBe(false);
  expect(verifySignature(body, sig, "")).toBe(false); // no secret configured
});

test("deleteSlipFile: deletes inside storage root, refuses outside, handles already-missing", async () => {
  const dir = join(env.localStoragePath, "slips", `retention-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    const inside = join(dir, "a.jpg");
    await writeFile(inside, "x");
    expect(await deleteSlipFile(inside)).toBe("deleted");
    expect(await deleteSlipFile(inside)).toBe("missing"); // already gone -> no throw

    // Outside the configured storage root: refused outright, never touched.
    expect(await deleteSlipFile("/etc/passwd")).toBe("skipped");
    // Path-traversal attempt that resolves outside the root.
    const traversal = join(resolve(env.localStoragePath), "..", "definitely-outside.jpg");
    expect(await deleteSlipFile(traversal)).toBe("skipped");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
