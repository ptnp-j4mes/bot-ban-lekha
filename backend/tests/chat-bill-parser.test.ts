import { describe, expect, test } from "bun:test";
import { parseChatBillMessage } from "../src/services/chat-bill-parser";

describe("parseChatBillMessage", () => {
  test("splits one message into sequential bills and infers mixed dates", () => {
    const text = `บิล 7️⃣
ต้น2000ส่ง795ทุก7วัน4งวดจบ
3/9 💸 795✅
10 💸 795✅
17 💸 795✅
24 💸 795
จบ
ต้น 2000 ส่ง1212 ทุก12วัน3งวดจบ
24 💸 1212✅
5/9 💸 1212✅
17 💸 1212✅
จบ`;

    expect(parseChatBillMessage(text, "2026-09-16")).toEqual([
      {
        billNo: 1,
        principalAmount: 2000,
        cycleDays: 7,
        installments: [
          { installmentNo: 1, dueDate: "2026-09-03", amountDue: 795, amountPaid: 795, status: "paid", isLate: false, penaltyAmount: 0 },
          { installmentNo: 2, dueDate: "2026-09-10", amountDue: 795, amountPaid: 795, status: "paid", isLate: false, penaltyAmount: 0 },
          { installmentNo: 3, dueDate: "2026-09-17", amountDue: 795, amountPaid: 795, status: "paid", isLate: false, penaltyAmount: 0 },
          { installmentNo: 4, dueDate: "2026-09-24", amountDue: 795, amountPaid: 0, status: "pending", isLate: false, penaltyAmount: 0 },
        ],
      },
      {
        billNo: 2,
        principalAmount: 2000,
        cycleDays: 12,
        installments: [
          { installmentNo: 1, dueDate: "2026-08-24", amountDue: 1212, amountPaid: 1212, status: "paid", isLate: false, penaltyAmount: 0 },
          { installmentNo: 2, dueDate: "2026-09-05", amountDue: 1212, amountPaid: 1212, status: "paid", isLate: false, penaltyAmount: 0 },
          { installmentNo: 3, dueDate: "2026-09-17", amountDue: 1212, amountPaid: 1212, status: "paid", isLate: false, penaltyAmount: 0 },
        ],
      },
    ]);
  });

  test("keeps late separate from paid and does not invent a penalty", () => {
    const [bill] = parseChatBillMessage(
      "ต้น 2000 ส่ง 795 ทุก7วัน 1งวดจบ\n18/9 💸 795✅🔴ส่งล่าช้า\nจบ",
      "2026-09-16",
    );

    expect(bill.installments[0]).toMatchObject({
      status: "paid",
      amountPaid: 795,
      isLate: true,
      penaltyAmount: 0,
    });
  });

  test("reads an explicit installment penalty without reading the footer", () => {
    const [bill] = parseChatBillMessage(
      "ต้น 2000 ส่ง 795 1งวดจบ\n18/9 💸 795🔴ส่งล่าช้า ปรับ 500\nจบ\nชำระเกินเวลา ปรับ ชม.ละ 500 บาท",
      "2026-09-16",
    );

    expect(bill.installments[0].penaltyAmount).toBe(500);
  });

  test("uses no late flag or penalty when the installment has neither marker", () => {
    const [bill] = parseChatBillMessage(
      "ต้น 3000 คืน 3950 ระยะเวลา 11วัน วันที่ 18",
      "2026-09-17",
    );

    expect(bill.installments).toEqual([
      { installmentNo: 1, dueDate: "2026-09-18", amountDue: 3950, amountPaid: 0, status: "pending", isLate: false, penaltyAmount: 0 },
    ]);
  });
});
