import { parseChatBillMessage, type ParsedBill, type ParsedInstallment } from "./chat-bill-parser";
import { dateOnly } from "../lib/date";
import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";

export type ChatBillSource = {
  id: string;
  customerId: string;
  customerCode: string;
  displayName: string | null;
  sentAt: Date;
  messageText: string;
};

export type ChatBillImportDraft = ParsedBill & {
  sourceMessageId: string;
  customerId: string;
  customerCode: string;
  displayName: string | null;
  startDate: string;
  totalInstallments: number;
  billPenaltyAmount: number;
  status: "active" | "completed";
};

export type ChatBillImportSummary = {
  bills: number;
  installments: number;
  paid: number;
  pending: number;
  late: number;
  penalty: number;
};

function bangkokDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function latestStructuredSources(sources: ChatBillSource[]) {
  const chosen = new Map<string, { source: ChatBillSource; bills: ParsedBill[] }>();
  for (const source of [...sources].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())) {
    if (chosen.has(source.customerId)) continue;
    const bills = parseChatBillMessage(source.messageText, bangkokDate(source.sentAt));
    if (bills.length) chosen.set(source.customerId, { source, bills });
  }
  return [...chosen.values()];
}

export function buildChatBillImportDrafts(sources: ChatBillSource[]): ChatBillImportDraft[] {
  return latestStructuredSources(sources)
    .flatMap(({ source, bills }) => bills.map((bill) => ({
      ...bill,
      sourceMessageId: source.id,
      customerId: source.customerId,
      customerCode: source.customerCode,
      displayName: source.displayName,
      startDate: bill.installments[0].dueDate,
      totalInstallments: bill.installments.length,
      billPenaltyAmount: 0,
      status: bill.installments.every((installment) => installment.status === "paid") ? "completed" as const : "active" as const,
    })))
    .sort((a, b) => a.customerCode.localeCompare(b.customerCode) || a.billNo - b.billNo);
}

export function summarizeChatBillImport(drafts: ChatBillImportDraft[]): ChatBillImportSummary {
  return drafts.reduce((summary, draft) => {
    summary.bills += 1;
    for (const installment of draft.installments as ParsedInstallment[]) {
      summary.installments += 1;
      summary[installment.status] += 1;
      if (installment.isLate) summary.late += 1;
      summary.penalty += installment.penaltyAmount;
    }
    return summary;
  }, { bills: 0, installments: 0, paid: 0, pending: 0, late: 0, penalty: 0 });
}

export function toImportedPlanData(draft: ChatBillImportDraft) {
  return {
    customerId: draft.customerId,
    billNo: draft.billNo,
    principalAmount: draft.principalAmount,
    installmentAmount: 0,
    cycleType: "custom_dates",
    cycleDays: null,
    totalInstallments: draft.totalInstallments,
    startDate: dateOnly(draft.startDate),
    status: draft.status,
    penaltyAmount: draft.billPenaltyAmount,
    bankAccountId: null,
    note: null,
    installments: draft.installments.map((installment) => ({
      installmentNo: installment.installmentNo,
      dueDate: dateOnly(installment.dueDate),
      amountDue: installment.amountDue,
      amountPaid: installment.amountPaid,
      status: installment.status,
      isLate: installment.isLate,
      penaltyAmount: installment.penaltyAmount,
      paidAt: null,
      paidByPaymentId: null,
    })),
  };
}

export async function applyChatBillImport(
  db: PrismaClient,
  orgId: string,
  drafts: ChatBillImportDraft[],
) {
  if (!drafts.length) return [];

  const customerIds = [...new Set(drafts.map((draft) => draft.customerId))];
  const billNos = [...new Set(drafts.map((draft) => draft.billNo))];
  const keys = new Set<string>();
  const duplicateDrafts: string[] = [];
  for (const draft of drafts) {
    const key = `${draft.customerId}:${draft.billNo}`;
    if (keys.has(key)) duplicateDrafts.push(key);
    keys.add(key);
  }
  if (duplicateDrafts.length) throw new Error(`duplicate bills in import: ${duplicateDrafts.join(", ")}`);

  const customers = await db.customer.findMany({
    where: { id: { in: customerIds }, orgId },
    select: { id: true },
  });
  if (customers.length !== customerIds.length) throw new Error("customer is not in organization");

  const existing = await db.billPlan.findMany({
    where: { orgId, customerId: { in: customerIds }, billNo: { in: billNos } },
    select: { customerId: true, billNo: true },
  });
  const existingKeys = existing.map((plan) => `${plan.customerId}:${plan.billNo}`);
  if (existingKeys.length) throw new Error(`bill already exists: ${existingKeys.join(", ")}`);

  return db.$transaction(async (tx) => {
    const created = [];
    for (const draft of drafts) {
      const data = toImportedPlanData(draft);
      const plan = await tx.billPlan.create({
        data: {
          orgId,
          ...data,
          installments: { create: data.installments },
        },
        include: { installments: true },
      });
      await audit(tx, {
        action: "import_chat_bill_plan",
        entityType: "bill_plan",
        entityId: plan.id,
        orgId,
        actorType: "system",
        newValue: { sourceMessageId: draft.sourceMessageId, billNo: draft.billNo },
      });
      created.push(plan);
    }
    return created;
  });
}
