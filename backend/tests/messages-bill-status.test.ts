import { expect, test } from "bun:test";
import { renderBillStatusLines } from "../src/services/messages";

test("renders paid, late, and penalty as independent installment markers", () => {
  const dueDate = new Date("2026-09-18T00:00:00.000Z");

  expect(renderBillStatusLines([
    { dueDate, amountDue: 795, status: "paid", isLate: true, penaltyAmount: 500 },
    { dueDate, amountDue: 795, status: "paid", isLate: true, penaltyAmount: 0 },
    { dueDate, amountDue: 795, status: "pending", isLate: false, penaltyAmount: 0 },
  ])).toBe("18💸 795✅ 🔴ส่งล่าช้า ค่าปรับ500\n18💸 795✅ 🔴ส่งล่าช้า\n18💸 795");
});
