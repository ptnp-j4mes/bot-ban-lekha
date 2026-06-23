import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/response";

type Tx = PrismaClient | Prisma.TransactionClient;

export function loadOa(db: Tx, id: string) {
  return db.lineOaAccount.findUnique({ where: { id } }).then((o) => {
    if (!o) throw new ApiError("NOT_FOUND", "LINE OA account not found");
    return o;
  });
}

// Resolve the OA (token) to use when replying to a submission. Tolerates missing OA in dev.
export async function oaForSubmission(db: Tx, lineOaId: string | null | undefined) {
  if (!lineOaId) return { id: null as string | null, accessToken: "" };
  const o = await db.lineOaAccount.findUnique({ where: { id: lineOaId } });
  return { id: o?.id ?? null, accessToken: o?.channelAccessToken ?? "" };
}

// Public projection — never leak channel secret / access token over the API.
export const publicOa = (o: any) => ({
  id: o.id,
  name: o.name,
  channelId: o.channelId,
  isActive: o.isActive,
  hasSecret: !!o.channelSecret,
  hasToken: !!o.channelAccessToken,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

export const prismaOa = prisma; // re-export convenience
