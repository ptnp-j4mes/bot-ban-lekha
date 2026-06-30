import { prisma } from "../lib/prisma";
import { env } from "../env";
import { audit } from "./audit";
import { deleteSlipFile } from "./storage";
import { getSystemSettings } from "./systemSettings";
import { captureError } from "../lib/logger";

// Precedence: org override > system default > env default. 0 is a valid override
// ("purge immediately") so every check is `!= null`, never a truthiness check.
export function effectiveRetentionDays(orgDays: number | null | undefined, systemDays: number | null | undefined): number {
  if (orgDays != null) return orgDays;
  if (systemDays != null) return systemDays;
  return env.slipRetentionDaysDefault;
}

export async function effectiveRetentionDaysForOrg(orgId: string | null | undefined): Promise<number> {
  const sys = await getSystemSettings();
  if (!orgId) return effectiveRetentionDays(null, sys.defaultSlipRetentionDays);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { slipRetentionDays: true } });
  return effectiveRetentionDays(org?.slipRetentionDays ?? null, sys.defaultSlipRetentionDays);
}

// Delete a submission's local slip file (if any) and clear image_url, keeping every other
// column (OCR text, parsed fields, match/review status, image hash) intact. Idempotent: a
// submission with no image_url (already purged, or never stored) is a no-op.
export async function purgeSlipImage(submissionId: string, actorType: "system" | "admin" = "system") {
  const sub = await prisma.paymentSubmission.findUnique({ where: { id: submissionId } });
  if (!sub || !sub.imageUrl) return { purged: false as const };

  const result = await deleteSlipFile(sub.imageUrl);
  await prisma.paymentSubmission.update({
    where: { id: submissionId },
    data: { imageUrl: null, imagePurgedAt: new Date() },
  });
  await audit(prisma, {
    action: "purge_slip_image",
    entityType: "payment_submission",
    entityId: submissionId,
    orgId: sub.orgId,
    actorType,
    newValue: { fileResult: result },
  });
  return { purged: true as const, fileResult: result };
}

// Purge every submission past its org's (or the system/env default) retention window.
// Batched per org with a take limit so one huge backlog can't block a scheduler tick.
export async function purgeExpiredSlips(limitPerOrg = 200) {
  const sys = await getSystemSettings();
  const orgs = await prisma.organization.findMany({ select: { id: true, slipRetentionDays: true } });

  let purged = 0;
  let errors = 0;
  for (const org of orgs) {
    const days = effectiveRetentionDays(org.slipRetentionDays, sys.defaultSlipRetentionDays);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const expired = await prisma.paymentSubmission.findMany({
      where: { orgId: org.id, imageUrl: { not: null }, createdAt: { lt: cutoff } },
      select: { id: true },
      take: limitPerOrg,
    });
    for (const sub of expired) {
      try {
        await purgeSlipImage(sub.id);
        purged++;
      } catch (e) {
        errors++;
        captureError(e, { scope: "purge_expired_slips", submissionId: sub.id, orgId: org.id });
        await audit(prisma, {
          action: "purge_slip_image_failed",
          entityType: "payment_submission",
          entityId: sub.id,
          orgId: org.id,
          actorType: "system",
          newValue: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }
  }
  return { purged, errors };
}
