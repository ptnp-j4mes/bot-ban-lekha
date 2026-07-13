import { prisma } from "../lib/prisma";

// Platform-wide settings live in a single row (id = "system"). Read on nearly every
// bill render + slip upload, so cache in memory and bust on write.
// ponytail: process-local cache; fine for a single instance, add a pub/sub bust if it ever scales out.
type Settings = {
  defaultBillFooter: string | null;
  defaultTimezone: string;
  defaultSlipRetentionDays: number | null;
  storageDriver: string;
  gdriveServiceAccount: any | null;
  gdriveRootFolderId: string | null;
};
let cache: Settings | null = null;

const shape = (row: any): Settings => ({
  defaultBillFooter: row.defaultBillFooter,
  defaultTimezone: row.defaultTimezone,
  defaultSlipRetentionDays: row.defaultSlipRetentionDays,
  storageDriver: row.storageDriver,
  gdriveServiceAccount: row.gdriveServiceAccount ?? null,
  gdriveRootFolderId: row.gdriveRootFolderId,
});

export async function getSystemSettings() {
  if (cache) return cache;
  const row = await prisma.systemSetting.upsert({ where: { id: "system" }, update: {}, create: { id: "system" } });
  cache = shape(row);
  return cache;
}

export async function updateSystemSettings(data: {
  defaultBillFooter?: string | null;
  defaultTimezone?: string;
  defaultSlipRetentionDays?: number | null;
  storageDriver?: string;
  gdriveServiceAccount?: any | null;
  gdriveRootFolderId?: string | null;
}) {
  const row = await prisma.systemSetting.upsert({ where: { id: "system" }, update: data, create: { id: "system", ...data } });
  cache = shape(row);
  return row;
}
