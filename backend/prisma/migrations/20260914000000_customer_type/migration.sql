-- AlterTable
ALTER TABLE "customers"
  ADD COLUMN "customer_type" TEXT NOT NULL DEFAULT 'customer';

-- CreateIndex
CREATE INDEX "customers_org_id_customer_type_idx" ON "customers"("org_id", "customer_type");
