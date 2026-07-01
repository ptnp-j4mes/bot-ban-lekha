-- Slip retention policy: org/system default retention (days) + per-submission purge marker.
ALTER TABLE "system_settings" ADD COLUMN "default_slip_retention_days" INTEGER;
ALTER TABLE "organizations" ADD COLUMN "slip_retention_days" INTEGER;
ALTER TABLE "payment_submissions" ADD COLUMN "image_purged_at" TIMESTAMP(3);
