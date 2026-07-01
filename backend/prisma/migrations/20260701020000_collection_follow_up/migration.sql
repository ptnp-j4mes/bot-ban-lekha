-- Debtor follow-up workflow + activity timeline (Issue #15).
-- Kept fully separate from payment/installment status: no FK to Payment/BillInstallment,
-- no writes from the payment approval flow.

-- CreateTable
CREATE TABLE "customer_follow_ups" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "promise_to_pay_date" DATE,
    "next_follow_up_date" DATE,
    "assigned_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_activities" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT,
    "note" TEXT,
    "promise_to_pay_date" DATE,
    "next_follow_up_date" DATE,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_follow_ups_customer_id_key" ON "customer_follow_ups"("customer_id");

-- CreateIndex
CREATE INDEX "customer_follow_ups_org_id_idx" ON "customer_follow_ups"("org_id");

-- CreateIndex
CREATE INDEX "customer_follow_ups_org_id_status_idx" ON "customer_follow_ups"("org_id", "status");

-- CreateIndex
CREATE INDEX "collection_activities_org_id_idx" ON "collection_activities"("org_id");

-- CreateIndex
CREATE INDEX "collection_activities_customer_id_idx" ON "collection_activities"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_follow_ups" ADD CONSTRAINT "customer_follow_ups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_follow_ups" ADD CONSTRAINT "customer_follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
