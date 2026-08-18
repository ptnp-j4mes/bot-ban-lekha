import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays } from "../lib/date";
import { ApiError } from "../lib/response";
import { renderGroupedBillText } from "./messages";
import { getSystemSettings } from "./systemSettings";

type Tx = PrismaClient | Prisma.TransactionClient;

export type GeneratedInstallment = { installmentNo: number; dueDate: Date; amountDue: number };

// due_date(n) = start_date + cycle_days * (n - 1)
export function generateInstallments(
  startDate: Date,
  cycleDays: number,
  total: number,
  amount: number
): GeneratedInstallment[] {
  if (cycleDays <= 0) throw new ApiError("VALIDATION_ERROR", "cycle_days must be > 0");
  if (total <= 0) throw new ApiError("VALIDATION_ERROR", "total_installments must be > 0");
  if (amount <= 0) throw new ApiError("VALIDATION_ERROR", "installment_amount must be > 0");
  return Array.from({ length: total }, (_, i) => ({
    installmentNo: i + 1,
    dueDate: addDays(startDate, cycleDays * i),
    amountDue: amount,
  }));
}

// Resolve the bank account to attach to a new bill within an org: explicit id or org default.
export async function resolveBankAccount(db: Tx, orgId: string, bankAccountId?: string | null) {
  if (bankAccountId) {
    const acc = await db.bankAccount.findFirst({ where: { id: bankAccountId, orgId } });
    if (!acc) throw new ApiError("BANK_ACCOUNT_NOT_FOUND", "Bank account not found");
    if (!acc.isActive) throw new ApiError("BANK_ACCOUNT_INACTIVE", "Bank account is inactive");
    return acc;
  }
  const def = await db.bankAccount.findFirst({ where: { orgId, isDefault: true, isActive: true } });
  if (!def) throw new ApiError("DEFAULT_BANK_ACCOUNT_REQUIRED", "No active default bank account");
  return def;
}

// Load a plan and render its current bill text + completion flag.
export async function renderPlanBill(db: Tx, billPlanId: string) {
  const plan = await db.billPlan.findUnique({
    where: { id: billPlanId },
    include: { installments: { orderBy: { installmentNo: "asc" } }, bankAccount: true, organization: true },
  });
  if (!plan) throw new ApiError("NOT_FOUND", "Bill plan not found");
  const plans = plan.status === "active"
    ? await db.billPlan.findMany({
        where: { customerId: plan.customerId, status: "active" },
        include: { installments: { orderBy: { installmentNo: "asc" } }, bankAccount: true, organization: true },
        orderBy: { billNo: "asc" },
      })
    : [plan];
  const footer = plan.organization?.billFooter || (await getSystemSettings()).defaultBillFooter;
  const text = renderGroupedBillText({
    billNo: plan.billNo,
    plans: plans.map((current) => ({
      principal: Number(current.principalAmount),
      installmentAmount: Number(current.installmentAmount),
      cycleDays: current.cycleDays,
      totalInstallments: current.totalInstallments,
      billPenaltyAmount: Number(current.penaltyAmount),
      installments: current.installments.map((i) => ({
        dueDate: i.dueDate,
        amountDue: Number(i.amountDue),
        status: i.status,
        penaltyAmount: Number(i.penaltyAmount),
      })),
      bank: current.bankAccount
        ? {
            accountNo: current.bankAccount.accountNo,
            bankName: current.bankAccount.bankName,
            accountName: current.bankAccount.accountName,
          }
        : null,
      note: current.note,
    })),
    footer,
  });
  const completed = plans.every((current) => current.installments.every((i) => i.status === "paid"));
  return { plan, plans, completed, text };
}
