import { prisma } from "../lib/prisma";
import {
  applyChatBillImport,
  buildChatBillImportDrafts,
  summarizeChatBillImport,
  type ChatBillSource,
} from "../services/chat-bill-import";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readSources(orgId: string): Promise<ChatBillSource[]> {
  const messages = await prisma.messageLog.findMany({
    where: {
      orgId,
      direction: "inbound",
      messageType: "inbound_text",
      customerId: { not: null },
      messageText: { not: null },
    },
    select: {
      id: true,
      customerId: true,
      messageText: true,
      sentAt: true,
      customer: { select: { customerCode: true, displayName: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  return messages.flatMap((message) => message.customerId && message.messageText && message.customer
    ? [{
        id: message.id,
        customerId: message.customerId,
        customerCode: message.customer.customerCode,
        displayName: message.customer.displayName,
        sentAt: message.sentAt,
        messageText: message.messageText,
      }]
    : []);
}

function report(drafts: ReturnType<typeof buildChatBillImportDrafts>) {
  return drafts.map((draft) => ({
    customerCode: draft.customerCode,
    displayName: draft.displayName,
    billNo: draft.billNo,
    principalAmount: draft.principalAmount,
    status: draft.status,
    installments: draft.installments.map((installment) => ({
      installmentNo: installment.installmentNo,
      dueDate: installment.dueDate,
      amountDue: installment.amountDue,
      amountPaid: installment.amountPaid,
      status: installment.status,
      isLate: installment.isLate,
      penaltyAmount: installment.penaltyAmount,
    })),
  }));
}

async function main() {
  const orgId = option("--org-id");
  if (!orgId) throw new Error("--org-id is required");
  const apply = process.argv.includes("--apply");
  const drafts = buildChatBillImportDrafts(await readSources(orgId));
  const output: Record<string, unknown> = {
    mode: apply ? "apply" : "dry-run",
    orgId,
    summary: summarizeChatBillImport(drafts),
    drafts: report(drafts),
  };

  if (apply) {
    const created = await applyChatBillImport(prisma, orgId, drafts);
    output.inserted = created.length;
  }
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
