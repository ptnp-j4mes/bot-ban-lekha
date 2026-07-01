import { prisma } from "../lib/prisma";
import { env } from "../env";
import { deleteSlipFile } from "./storage";
import { audit } from "./audit";
import { captureError } from "../lib/logger";
import { getSystemSettings } from "./systemSettings";

// Precedence: org override > system default > env default. 0 is a real, distinct value
// ("purge right after OCR") — never treat it as unset, so every check below uses `!= null`.
export async function effectiveRetentionDays(orgSlipRetentionDays: number | null | undefined): Promise<number> {
  if (orgSlipRetentionDays != null) return orgSlipRetentionDays;
  const { defaultSlipRetentionDays } = await getSystemSettings();
  if (defaultSlipRetentionDays != null) return defaultSlipRetentionDays;
  return env.slipRetentionDays;
}

export async function effectiveRetentionDaysForOrg(orgId: string | null | undefined): Promise<number> {
  if (!orgId) return effectiveRetentionDays(null);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { slipRetentionDays: true } });
  return effectiveRetentionDays(org?.slipRetentionDays ?? null);
}

// Purge the local slip file for one submission. Only clears `imageUrl` / sets `imagePurgedAt` —
// OCR text, parsed fields, match/review status, and image_hash are left untouched so duplicate
// detection and audit history keep working after purge. Idempotent: a no-op if already purged.
export async function purgeSlipImage(submissionId: string): Promise<{ purged: boolean; reason?: string }> {
  const sub = await prisma.paymentSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, orgId: true, imageUrl: true, imagePurgedAt: true },
  });
  if (!sub) return { purged: false, reason: "not_found" };
  if (!sub.imageUrl || sub.imagePurgedAt) return { purged: false, reason: "already_purged" };

  try {
    const result = await deleteSlipFile(sub.imageUrl);
    await prisma.paymentSubmission.update({
      where: { id: sub.id },
      data: { imageUrl: null, imagePurgedAt: new Date() },
    });
    await audit(prisma, {
      action: "purge_slip_image",
      entityType: "payment_submission",
      entityId: sub.id,
      orgId: sub.orgId,
      actorType: "system",
      newValue: { result },
    });
    return { purged: true };
  } catch (e) {
    captureError(e, { scope: "purge_slip_image", submissionId: sub.id });
    await audit(prisma, {
      action: "purge_slip_image_failed",
      entityType: "payment_submission",
      entityId: sub.id,
      orgId: sub.orgId,
      actorType: "system",
      newValue: { error: String((e as any)?.message ?? e) },
    });
    return { purged: false, reason: "error" };
  }
}

// Batch job: for each org, purge slip images older than that org's effective retention window.
// Retention 0 means "purge immediately after processing" (handled at the webhook), but this batch
// also sweeps anything still sitting around (e.g. retention lowered after the fact, or a missed
// immediate-purge) so nothing outlives its configured window.
export async function purgeExpiredSlips() {
  const orgs = await prisma.organization.findMany({ select: { id: true, slipRetentionDays: true } });
  let purged = 0;
  let failed = 0;
  let candidates = 0;

  for (const org of orgs) {
    const days = await effectiveRetentionDays(org.slipRetentionDays);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const subs = await prisma.paymentSubmission.findMany({
      where: { orgId: org.id, imageUrl: { not: null }, imagePurgedAt: null, createdAt: { lte: cutoff } },
      select: { id: true },
    });
    candidates += subs.length;
    for (const s of subs) {
      const r = await purgeSlipImage(s.id);
      if (r.purged) purged++;
      else failed++;
    }
  }
  return { candidates, purged, failed };
}
