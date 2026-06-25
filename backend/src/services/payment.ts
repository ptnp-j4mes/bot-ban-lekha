import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/response";
import { bangkokToday } from "../lib/date";
import { decideMatch, type Candidate } from "./matching";
import { audit } from "./audit";
import { renderPlanBill } from "./bill";
import { oaForSubmission } from "./oa";
import {
  sendAndLog,
  renderPaymentReceived,
  renderNeedsAdminMatch,
  renderPaymentApproved,
  renderPaymentRejected,
} from "./messages";

type Tx = PrismaClient | Prisma.TransactionClient;

// Is the slip's reference_no / image_hash free of an already-approved submission?
async function referenceUnique(db: Tx, sub: { id: string; parsedReferenceNo: string | null; imageHash: string | null }) {
  const keys: Prisma.PaymentSubmissionWhereInput[] = [];
  if (sub.parsedReferenceNo) keys.push({ parsedReferenceNo: sub.parsedReferenceNo });
  if (sub.imageHash) keys.push({ imageHash: sub.imageHash });
  if (keys.length === 0) return true;
  const dupe = await db.paymentSubmission.findFirst({
    where: { id: { not: sub.id }, reviewStatus: "approved", OR: keys },
  });
  return !dupe;
}

// Run auto-matching on a freshly-created submission and notify the customer.
export async function processSubmission(submissionId: string) {
  const sub = await prisma.paymentSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new ApiError("NOT_FOUND", "Submission not found");

  const today = bangkokToday();
  const refUnique = await referenceUnique(prisma, sub);
  const isGroup = !!sub.lineGroupId;
  // 1:1 → match within the known customer; group → match org-wide (sender is staff, not the customer).
  const matchable = !!sub.customerId || (isGroup && !!sub.orgId);

  let candidates: Candidate[] = [];
  if (sub.customerId || isGroup) {
    const insts = await prisma.billInstallment.findMany({
      where: {
        status: { in: ["pending", "partial_paid", "overdue"] },
        billPlan: sub.customerId
          ? { customerId: sub.customerId, status: "active", orgId: sub.orgId ?? undefined }
          : { status: "active", orgId: sub.orgId ?? undefined },
      },
    });
    candidates = insts.map((i) => ({ id: i.id, amountDue: Number(i.amountDue), dueDate: i.dueDate }));
  }

  const decision = decideMatch(
    { amount: sub.parsedAmount ? Number(sub.parsedAmount) : null, transferDate: sub.parsedTransferDate },
    candidates,
    { today, referenceUnique: refUnique, customerKnown: matchable }
  );

  const updated = await prisma.paymentSubmission.update({
    where: { id: sub.id },
    data: {
      matchStatus: decision.status,
      matchedInstallmentId: decision.installmentId,
      matchConfidence: decision.score,
      matchReason: decision.reason,
    },
  });

  // Phase 1: auto_matched still waits for admin approval (pending_review).
  const text = decision.status === "auto_matched" ? renderPaymentReceived() : renderNeedsAdminMatch();
  const messageType = decision.status === "auto_matched" ? "payment_received" : "payment_need_admin";
  const oa = await oaForSubmission(prisma, sub.lineOaId);
  await sendAndLog(prisma, {
    lineUserId: sub.lineGroupId ?? sub.lineUserId, // reply to the group, or the 1:1 chat
    text,
    messageType,
    accessToken: oa.accessToken,
    orgId: sub.orgId,
    lineOaId: sub.lineOaId,
    customerId: sub.customerId,
    paymentSubmissionId: sub.id,
  });
  await audit(prisma, {
    action: "process_payment_submission",
    entityType: "payment_submission",
    entityId: sub.id,
    orgId: sub.orgId,
    actorType: "system",
    newValue: { matchStatus: decision.status, score: decision.score },
  });
  return updated;
}

// Admin manual match (scoped to the admin's org).
export async function matchInstallment(submissionId: string, installmentId: string, note: string | undefined, actorId: string, orgId: string) {
  const sub = await prisma.paymentSubmission.findFirst({ where: { id: submissionId, orgId } });
  if (!sub) throw new ApiError("NOT_FOUND", "Submission not found");
  const inst = await prisma.billInstallment.findFirst({ where: { id: installmentId, billPlan: { orgId } } });
  if (!inst) throw new ApiError("NOT_FOUND", "Installment not found");
  if (inst.status === "paid") throw new ApiError("INSTALLMENT_ALREADY_PAID", "Installment already paid");

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.paymentSubmission.update({
      where: { id: submissionId },
      data: { matchedInstallmentId: installmentId, matchStatus: "admin_matched", matchReason: note ?? "admin matched" },
    });
    await audit(tx, {
      action: "match_payment_submission",
      entityType: "payment_submission",
      entityId: submissionId,
      orgId,
      actorId,
      newValue: { installmentId, note },
    });
    return u;
  });
  return updated;
}

// Approve: create the real payment, update installment + plan, notify customer. All in one transaction.
export async function approveSubmission(submissionId: string, actorId: string, orgId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.paymentSubmission.findFirst({ where: { id: submissionId, orgId } });
    if (!sub) throw new ApiError("NOT_FOUND", "Submission not found");
    if (sub.reviewStatus === "approved") throw new ApiError("VALIDATION_ERROR", "Already approved");
    if (!sub.matchedInstallmentId) throw new ApiError("VALIDATION_ERROR", "No matched installment");

    const inst = await tx.billInstallment.findUnique({
      where: { id: sub.matchedInstallmentId },
      include: { billPlan: true },
    });
    if (!inst) throw new ApiError("NOT_FOUND", "Installment not found");
    if (inst.status === "paid") throw new ApiError("INSTALLMENT_ALREADY_PAID", "Installment already paid");

    if (!(await referenceUnique(tx, sub))) throw new ApiError("DUPLICATE_SLIP", "Reference/image already used");

    const amount = sub.parsedAmount ? Number(sub.parsedAmount) : Number(inst.amountDue);
    const customerId = sub.customerId ?? inst.billPlan.customerId;
    const newPaid = Number(inst.amountPaid) + amount;
    const status = newPaid >= Number(inst.amountDue) ? "paid" : "partial_paid";
    const paidAt = sub.parsedTransferDate ?? new Date();

    const payment = await tx.payment.create({
      data: {
        orgId,
        customerId,
        paymentSubmissionId: sub.id,
        billInstallmentId: inst.id,
        amount,
        paidAt,
        approvedBy: actorId,
      },
    });

    await tx.billInstallment.update({
      where: { id: inst.id },
      data: { amountPaid: newPaid, status, paidAt: status === "paid" ? paidAt : null, paidByPaymentId: payment.id },
    });

    await tx.paymentSubmission.update({
      where: { id: sub.id },
      data: { reviewStatus: "approved", reviewedBy: actorId, reviewedAt: new Date() },
    });

    // Complete the plan if every installment is now paid.
    const remaining = await tx.billInstallment.count({
      where: { billPlanId: inst.billPlanId, status: { not: "paid" } },
    });
    if (remaining === 0)
      await tx.billPlan.update({ where: { id: inst.billPlanId }, data: { status: "completed" } });

    const bill = await renderPlanBill(tx, inst.billPlanId);
    const text = renderPaymentApproved(bill.text);
    const oa = await oaForSubmission(tx, sub.lineOaId);
    await sendAndLog(tx, {
      lineUserId: sub.lineGroupId ?? sub.lineUserId,
      text,
      messageType: "payment_approved",
      accessToken: oa.accessToken,
      orgId,
      lineOaId: sub.lineOaId,
      customerId,
      billPlanId: inst.billPlanId,
      billInstallmentId: inst.id,
      paymentSubmissionId: sub.id,
    });
    await audit(tx, {
      action: "approve_payment",
      entityType: "payment",
      entityId: payment.id,
      orgId,
      actorId,
      newValue: { amount, installmentId: inst.id },
    });
    return { payment, billText: text };
  });
}

// Record a payment made outside the slip flow (cash, manual bank confirm). Marks the
// installment paid/partial, completes the plan, and notifies the customer if LINE-linked.
export async function recordManualPayment(installmentId: string, amount: number, actorId: string, orgId: string, method = "cash") {
  if (!(amount > 0)) throw new ApiError("VALIDATION_ERROR", "amount must be > 0");
  return prisma.$transaction(async (tx) => {
    const inst = await tx.billInstallment.findFirst({
      where: { id: installmentId, billPlan: { orgId } },
      include: { billPlan: { include: { customer: { include: { lineOa: true } } } } },
    });
    if (!inst) throw new ApiError("NOT_FOUND", "Installment not found");
    if (inst.status === "paid") throw new ApiError("INSTALLMENT_ALREADY_PAID", "Installment already paid");

    const newPaid = Number(inst.amountPaid) + amount;
    const status = newPaid >= Number(inst.amountDue) ? "paid" : "partial_paid";
    const paidAt = new Date();
    const payment = await tx.payment.create({
      data: { orgId, customerId: inst.billPlan.customerId, billInstallmentId: inst.id, amount, paidAt, paymentMethod: method, approvedBy: actorId },
    });
    await tx.billInstallment.update({
      where: { id: inst.id },
      data: { amountPaid: newPaid, status, paidAt: status === "paid" ? paidAt : null, paidByPaymentId: payment.id },
    });
    const remaining = await tx.billInstallment.count({ where: { billPlanId: inst.billPlanId, status: { not: "paid" } } });
    if (remaining === 0) await tx.billPlan.update({ where: { id: inst.billPlanId }, data: { status: "completed" } });

    const cust = inst.billPlan.customer;
    if (cust?.lineUserId) {
      const bill = await renderPlanBill(tx, inst.billPlanId);
      await sendAndLog(tx, {
        lineUserId: cust.lineUserId, text: renderPaymentApproved(bill.text), messageType: "payment_approved",
        accessToken: cust.lineOa?.channelAccessToken, orgId, lineOaId: cust.lineOaId, customerId: cust.id,
        billPlanId: inst.billPlanId, billInstallmentId: inst.id,
      });
    }
    await audit(tx, { action: "record_manual_payment", entityType: "payment", entityId: payment.id, orgId, actorId, newValue: { amount, method, installmentId: inst.id } });
    return { payment, status };
  });
}

export async function rejectSubmission(submissionId: string, reason: string, actorId: string, orgId: string) {
  const sub = await prisma.paymentSubmission.findFirst({ where: { id: submissionId, orgId } });
  if (!sub) throw new ApiError("NOT_FOUND", "Submission not found");
  return prisma.$transaction(async (tx) => {
    const u = await tx.paymentSubmission.update({
      where: { id: submissionId },
      data: { reviewStatus: "rejected", matchStatus: "rejected", reviewedBy: actorId, reviewedAt: new Date() },
    });
    const oa = await oaForSubmission(tx, sub.lineOaId);
    await sendAndLog(tx, {
      lineUserId: sub.lineGroupId ?? sub.lineUserId,
      text: renderPaymentRejected(reason),
      messageType: "payment_rejected",
      accessToken: oa.accessToken,
      orgId,
      lineOaId: sub.lineOaId,
      customerId: sub.customerId,
      paymentSubmissionId: sub.id,
    });
    await audit(tx, {
      action: "reject_payment",
      entityType: "payment_submission",
      entityId: submissionId,
      orgId,
      actorId,
      newValue: { reason },
    });
    return u;
  });
}
