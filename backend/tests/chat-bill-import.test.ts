import { expect, test } from "bun:test";
import { buildChatBillImportDrafts, summarizeChatBillImport, toImportedPlanData } from "../src/services/chat-bill-import";

const twoBillMessage = `ต้น2000ส่ง795ทุก7วัน2งวดจบ
3/9 💸 795✅
10 💸 795✅
จบ
ต้น 3000 ส่ง1100 ทุก7วัน2งวดจบ
17 💸 1100
24 💸 1100
จบ`;

test("builds one-time import drafts from the latest structured message per customer", () => {
  const drafts = buildChatBillImportDrafts([
    {
      id: "old-message",
      customerId: "customer-1",
      customerCode: "C1",
      displayName: "Customer 1",
      sentAt: new Date("2026-09-15T10:00:00+07:00"),
      messageText: "ต้น 1000 ส่ง 100 ทุก7วัน 1งวดจบ\n15/9 💸 100\nจบ",
    },
    {
      id: "latest-message",
      customerId: "customer-1",
      customerCode: "C1",
      displayName: "Customer 1",
      sentAt: new Date("2026-09-16T10:00:00+07:00"),
      messageText: twoBillMessage,
    },
  ]);

  expect(drafts).toHaveLength(2);
  expect(drafts.map((draft) => draft.billNo)).toEqual([1, 2]);
  expect(drafts[0].sourceMessageId).toBe("latest-message");
  expect(drafts[0].status).toBe("completed");
  expect(drafts[1].status).toBe("active");
  expect(drafts[1].installments[0].dueDate).toBe("2026-09-17");
});

test("summarizes paid, pending, late, and penalty counts without inventing a penalty", () => {
  const drafts = buildChatBillImportDrafts([{
    id: "message-1",
    customerId: "customer-1",
    customerCode: "C1",
    displayName: "Customer 1",
    sentAt: new Date("2026-09-16T10:00:00+07:00"),
    messageText: "ต้น 2000 ส่ง 795 1งวดจบ\n18/9 💸 795✅🔴ส่งล่าช้า\nจบ",
  }]);

  expect(summarizeChatBillImport(drafts)).toEqual({
    bills: 1,
    installments: 1,
    paid: 1,
    pending: 0,
    late: 1,
    penalty: 0,
  });
});

test("maps a paid chat checkmark without creating a payment record", () => {
  const [draft] = buildChatBillImportDrafts([{
    id: "message-1",
    customerId: "customer-1",
    customerCode: "C1",
    displayName: "Customer 1",
    sentAt: new Date("2026-09-16T10:00:00+07:00"),
    messageText: "ต้น 2000 ส่ง 795 1งวดจบ\n18/9 💸 795✅🔴ส่งล่าช้า\nจบ",
  }]);

  expect(toImportedPlanData(draft)).toMatchObject({
    billNo: 1,
    principalAmount: 2000,
    installmentAmount: 0,
    status: "completed",
    penaltyAmount: 0,
  });
  expect(toImportedPlanData(draft).installments).toEqual([{
    installmentNo: 1,
    dueDate: new Date("2026-09-18T00:00:00.000Z"),
    amountDue: 795,
    amountPaid: 795,
    status: "paid",
    isLate: true,
    penaltyAmount: 0,
    paidAt: null,
    paidByPaymentId: null,
  }]);
});
