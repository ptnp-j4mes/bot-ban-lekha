import { describe, expect, test } from "bun:test";
import {
  buildChatBillImportDrafts,
  summarizeChatBillImport,
  type ChatBillSource,
} from "../src/services/chat-bill-import";

const source = (
  customerCode: string,
  displayName: string,
  messageText: string,
  sentAt = "2026-09-17T09:00:00+07:00",
): ChatBillSource => ({
  id: `fixture-${customerCode}`,
  customerId: `customer-${customerCode}`,
  customerCode,
  displayName,
  messageText,
  sentAt: new Date(sentAt),
});

const sources: ChatBillSource[] = [
  source(
    "LINE-0BED3E0E",
    "Joy wannisa",
    `บิล7️⃣
ต้น2000ส่ง795ทุก7วัน4งวดจบ
3/9💸 795✅
10 💸 795✅
17 💸 795✅
24 💸 795
จบ🙏
ต้น2000ส่ง1212ทุก12วัน3งวดจบ
24 💸 1212✅
5/9 💸 1212✅
17 💸 1212✅
จบ🙏`,
  ),
  source(
    "LINE-E0823354",
    "Phadee⭐️🎀🐰",
    "ต้น 3000 คืน 3950 ระยะเวลา 11วัน วันที่ 18",
  ),
  source(
    "LINE-67EAD1D9",
    "honey🎋睢兰🎋",
    `บิล23
ต้น8000ส่ง3750 ทุกสิ้นเดือน4งวดจบ
30/9 3750
31/10 3750
30/11 3750
31/12 3750
จบ
ต้น3000ส่ง1100ทุก7วัน4งวดจบ
23 1100
30 1100
7 1100
14 1100
จบ`,
  ),
  source(
    "LINE-F60EE25C",
    "MINK📮🚙✨",
    `บิล32
ต้น10,000ส่งคืน 13,000 รายเดือน ต้นจบดอก
30/9 13,000
จบ
ต้น2000ส่ง1212ทุก12วัน3งวดจบ
24 1212✅
5/9 1212✅
17 1212
จบ
ต้น2000คืน2550
16 2550✅
จบ`,
  ),
  source(
    "LINE-4C26600E",
    "🐇𝔄𝔩𝔦𝕤𝔞🖤🖤🉐🉐",
    `บิล29
ต้น6500คืน9295รายเดือน
7/10 9295
จบ
ต้น1500ส่ง240ทุก3วัน10งวดจบ
7 240✅🔴ส่งล่าช้า
10 240✅
13 240✅
16 240✅
19 240
22 240
25 240
28 240
1 240
4 240
จบ
ต้น2000ส่ง1212ทุก12วัน3งวดจบ
24 1212✅
5/9 1212✅
17 1212
จบ`,
  ),
  source(
    "LINE-33050B64",
    "Full Moon",
    `บิล6
ต้น2000ส่ง980ทุก7วัน3งวดจบ
9 980✅
16 980✅
23 980
จบ`,
  ),
  source(
    "LINE-2057218C",
    "กุ๊กไก่",
    `บิล21
ต้น3000คืน4450รายเดือน
30/9 4450
จบ
ต้น2000ส่ง980ทุก7วัน3งวดจบ
16 980✅
23 980
30 980
จบ`,
  ),
];

describe("current ChatClone first sweep", () => {
  test("produces the reviewed 14-bill, 42-installment batch", () => {
    const drafts = buildChatBillImportDrafts(sources);

    expect(summarizeChatBillImport(drafts)).toEqual({
      bills: 14,
      installments: 42,
      paid: 18,
      pending: 24,
      late: 1,
      penalty: 0,
    });

    const joy = drafts.filter((draft) => draft.customerCode === "LINE-0BED3E0E");
    expect(joy.map((draft) => draft.billNo)).toEqual([1, 2]);
    expect(joy[1]?.installments.map((row) => row.dueDate)).toEqual([
      "2026-08-24",
      "2026-09-05",
      "2026-09-17",
    ]);

    const late = drafts.flatMap((draft) =>
      draft.installments.filter((row) => row.isLate),
    );
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({
      amountDue: 240,
      amountPaid: 240,
      status: "paid",
      penaltyAmount: 0,
    });
  });
});
