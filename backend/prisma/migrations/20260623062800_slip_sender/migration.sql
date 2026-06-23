-- AlterTable
ALTER TABLE "payment_submissions" ADD COLUMN     "sender_name" TEXT;

-- CreateTable
CREATE TABLE "line_senders" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_senders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "line_senders_org_id_idx" ON "line_senders"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "line_senders_org_id_line_user_id_key" ON "line_senders"("org_id", "line_user_id");
