-- AlterTable
ALTER TABLE "message_logs"
  ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN "source_type" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "line_message_id" TEXT,
  ADD COLUMN "line_event" JSONB;

-- CreateIndex
CREATE INDEX "message_logs_org_id_direction_sent_at_idx" ON "message_logs"("org_id", "direction", "sent_at");
