import { prisma } from "../lib/prisma";

// Platform-wide settings live in a single row (id = "system"). Read on nearly every
// bill render, so cache in memory and bust on write.
// ponytail: process-local cache; fine for a single instance, add a pub/sub bust if it ever scales out.
let cache: { defaultBillFooter: string | null; defaultTimezone: string; defaultSlipRetentionDays: number | null } | null = null;

export async function getSystemSettings() {
  if (cache) return cache;
  const row = await prisma.systemSetting.upsert({
    where: { id: "system" },
    update: {},
    create: { id: "system" },
  });
  cache = {
    defaultBillFooter: row.defaultBillFooter,
    defaultTimezone: row.defaultTimezone,
    defaultSlipRetentionDays: row.defaultSlipRetentionDays,
  };
  return cache;
}

export async function updateSystemSettings(data: {
  defaultBillFooter?: string | null;
  defaultTimezone?: string;
  defaultSlipRetentionDays?: number | null;
}) {
  const row = await prisma.systemSetting.upsert({
    where: { id: "system" },
    update: data,
    create: { id: "system", ...data },
  });
  cache = {
    defaultBillFooter: row.defaultBillFooter,
    defaultTimezone: row.defaultTimezone,
    defaultSlipRetentionDays: row.defaultSlipRetentionDays,
  };
  return row;
}
