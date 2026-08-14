-- CreateTable
CREATE TABLE "bank_masters" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_masters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_masters_code_key" ON "bank_masters"("code");

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN "bank_master_id" TEXT;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_bank_master_id_fkey" FOREIGN KEY ("bank_master_id") REFERENCES "bank_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
