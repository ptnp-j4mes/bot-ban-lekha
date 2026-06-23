import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";

type Tx = PrismaClient | Prisma.TransactionClient;

export function audit(
  db: Tx,
  args: {
    action: string;
    entityType: string;
    entityId?: string;
    orgId?: string | null;
    actorType?: "admin" | "system" | "line_user";
    actorId?: string;
    oldValue?: unknown;
    newValue?: unknown;
  }
) {
  return db.auditLog.create({
    data: {
      orgId: args.orgId ?? undefined,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      actorType: args.actorType ?? "admin",
      actorId: args.actorId,
      oldValue: (args.oldValue as Prisma.InputJsonValue) ?? undefined,
      newValue: (args.newValue as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export const auditDefault = (a: Parameters<typeof audit>[1]) => audit(prisma, a);
