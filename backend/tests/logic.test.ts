import { test, expect } from "bun:test";
import { generateInstallments } from "../src/services/bill";
import { toEmojiNumber } from "../src/lib/emoji-number";
import { renderBillStatusLines, renderDailyReminder, renderBillText } from "../src/services/messages";
import { scoreInstallment, decideMatch } from "../src/services/matching";
import { mapGeminiResult, detectImageMime } from "../src/services/ocr";
import { dateOnly, toISODate } from "../src/lib/date";
import { verifySignature } from "../src/lib/line";
import { signJwt, verifyJwt } from "../src/lib/jwt";
import { createHmac } from "node:crypto";

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

test("scoreInstallment: full match = 110", () => {
  const today = dateOnly("2026-06-16");
  const c = { id: "x", amountDue: 490, dueDate: dateOnly("2026-06-16") };
  const score = scoreInstallment({ amount: 490, transferDate: dateOnly("2026-06-16") }, c, {
    today,
    referenceUnique: true,
  });
  expect(score).toBe(110);
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

test("decideMatch: needs admin when date mismatch", () => {
  const today = dateOnly("2026-06-16");
  const d = decideMatch(
    { amount: 490, transferDate: dateOnly("2026-06-10") },
    [{ id: "i1", amountDue: 490, dueDate: dateOnly("2026-06-16") }],
    { today, referenceUnique: true, customerKnown: true }
  );
  expect(d.status).toBe("needs_admin_match");
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
