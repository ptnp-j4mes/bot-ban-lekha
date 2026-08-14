ALTER TABLE "bill_plans" ADD COLUMN "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "bill_installments" ADD COLUMN "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
