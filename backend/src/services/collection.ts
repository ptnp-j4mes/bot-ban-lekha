// Debtor follow-up workflow: internal collector notes/status, fully separate from Payment/
// BillInstallment status. Never writes to those tables and never sends LINE messages.
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/response";
import { dateOnly } from "../lib/date";
import { audit } from "./audit";

export const FOLLOW_UP_STATUSES = ["new", "contacted", "promised_to_pay", "dispute", "unreachable", "resolved"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export type AddActivityInput = {
  status?: string;
  note?: string;
  promiseToPayDate?: string;
  nextFollowUpDate?: string;
  assignedToId?: string;
};

// Append a timeline entry for a customer and upsert their current follow-up state.
// Org-scoped: throws NOT_FOUND if the customer isn't in this org.
export async function addCollectionActivity(orgId: string, customerId: string, actorId: string | undefined, input: AddActivityInput) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, orgId } });
  if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");

  const { status, note, promiseToPayDate, nextFollowUpDate, assignedToId } = input;
  if (status !== undefined && !FOLLOW_UP_STATUSES.includes(status as FollowUpStatus))
    throw new ApiError("VALIDATION_ERROR", `status must be one of ${FOLLOW_UP_STATUSES.join(", ")}`);
  if (status === undefined && !note && promiseToPayDate === undefined && nextFollowUpDate === undefined && assignedToId === undefined)
    throw new ApiError("VALIDATION_ERROR", "at least one of status/note/promise_to_pay_date/next_follow_up_date/assigned_to_id is required");
  if (assignedToId) {
    const member = await prisma.membership.findFirst({ where: { orgId, adminUserId: assignedToId } });
    if (!member) throw new ApiError("VALIDATION_ERROR", "assigned_to_id must be a member of this org");
  }

  const activity = await prisma.collectionActivity.create({
    data: {
      orgId,
      customerId,
      status: status ?? null,
      note: note ?? null,
      promiseToPayDate: promiseToPayDate ? dateOnly(promiseToPayDate) : null,
      nextFollowUpDate: nextFollowUpDate ? dateOnly(nextFollowUpDate) : null,
      createdById: actorId ?? null,
    },
  });

  const update: Prisma.CustomerFollowUpUpdateInput = {};
  if (status !== undefined) update.status = status;
  if (promiseToPayDate !== undefined) update.promiseToPayDate = promiseToPayDate ? dateOnly(promiseToPayDate) : null;
  if (nextFollowUpDate !== undefined) update.nextFollowUpDate = nextFollowUpDate ? dateOnly(nextFollowUpDate) : null;
  if (assignedToId !== undefined) update.assignedToId = assignedToId || null;

  const followUp = await prisma.customerFollowUp.upsert({
    where: { customerId },
    create: {
      orgId,
      customerId,
      status: status ?? "new",
      promiseToPayDate: promiseToPayDate ? dateOnly(promiseToPayDate) : null,
      nextFollowUpDate: nextFollowUpDate ? dateOnly(nextFollowUpDate) : null,
      assignedToId: assignedToId || null,
    },
    update,
  });

  await audit(prisma, {
    action: "add_collection_activity",
    entityType: "customer",
    entityId: customerId,
    orgId,
    actorId,
    newValue: activity,
  });

  return { activity, followUp };
}
