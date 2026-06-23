-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_oa_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_secret" TEXT NOT NULL,
    "channel_access_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_oa_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "line_oa_id" TEXT,
    "customer_code" TEXT NOT NULL,
    "line_user_id" TEXT,
    "display_name" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_cycle_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cycle_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_cycle_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_no" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT,
    "branch_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_plans" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "bill_no" INTEGER NOT NULL,
    "principal_amount" DECIMAL(65,30) NOT NULL,
    "installment_amount" DECIMAL(65,30) NOT NULL,
    "cycle_type" TEXT NOT NULL DEFAULT 'interval_days',
    "cycle_days" INTEGER,
    "total_installments" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_installments" (
    "id" TEXT NOT NULL,
    "bill_plan_id" TEXT NOT NULL,
    "installment_no" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_due" DECIMAL(65,30) NOT NULL,
    "amount_paid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "paid_by_payment_id" TEXT,
    "morning_sent_at" TIMESTAMP(3),
    "before_deadline_sent_at" TIMESTAMP(3),
    "overdue_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "line_oa_id" TEXT,
    "customer_id" TEXT,
    "line_user_id" TEXT,
    "line_message_id" TEXT,
    "image_url" TEXT,
    "original_file_name" TEXT,
    "image_hash" TEXT,
    "ocr_status" TEXT NOT NULL DEFAULT 'pending',
    "ocr_raw_text" TEXT,
    "parsed_amount" DECIMAL(65,30),
    "parsed_transfer_date" DATE,
    "parsed_transfer_time" TEXT,
    "parsed_bank_name" TEXT,
    "parsed_account_no" TEXT,
    "parsed_reference_no" TEXT,
    "match_status" TEXT NOT NULL DEFAULT 'unmatched',
    "matched_installment_id" TEXT,
    "match_confidence" DECIMAL(65,30),
    "match_reason" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "payment_submission_id" TEXT,
    "bill_installment_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT NOT NULL DEFAULT 'bank_transfer',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "line_oa_id" TEXT,
    "customer_id" TEXT,
    "bill_plan_id" TEXT,
    "bill_installment_id" TEXT,
    "payment_submission_id" TEXT,
    "line_user_id" TEXT,
    "message_type" TEXT NOT NULL,
    "message_text" TEXT,
    "line_response" JSONB,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT,
    "username" TEXT,
    "password_hash" TEXT,
    "display_name" TEXT,
    "picture_url" TEXT,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "actor_id" TEXT,
    "actor_type" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_org_id_admin_user_id_key" ON "memberships"("org_id", "admin_user_id");

-- CreateIndex
CREATE INDEX "line_oa_accounts_org_id_idx" ON "line_oa_accounts"("org_id");

-- CreateIndex
CREATE INDEX "customers_org_id_idx" ON "customers"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_org_id_customer_code_key" ON "customers"("org_id", "customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_line_oa_id_line_user_id_key" ON "customers"("line_oa_id", "line_user_id");

-- CreateIndex
CREATE INDEX "bank_accounts_org_id_idx" ON "bank_accounts"("org_id");

-- CreateIndex
CREATE INDEX "bill_plans_org_id_idx" ON "bill_plans"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "bill_plans_customer_id_bill_no_key" ON "bill_plans"("customer_id", "bill_no");

-- CreateIndex
CREATE UNIQUE INDEX "bill_installments_bill_plan_id_installment_no_key" ON "bill_installments"("bill_plan_id", "installment_no");

-- CreateIndex
CREATE UNIQUE INDEX "bill_installments_bill_plan_id_due_date_key" ON "bill_installments"("bill_plan_id", "due_date");

-- CreateIndex
CREATE INDEX "payment_submissions_org_id_idx" ON "payment_submissions"("org_id");

-- CreateIndex
CREATE INDEX "payment_submissions_line_user_id_idx" ON "payment_submissions"("line_user_id");

-- CreateIndex
CREATE INDEX "payment_submissions_parsed_reference_no_idx" ON "payment_submissions"("parsed_reference_no");

-- CreateIndex
CREATE INDEX "payment_submissions_image_hash_idx" ON "payment_submissions"("image_hash");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_submission_id_key" ON "payments"("payment_submission_id");

-- CreateIndex
CREATE INDEX "payments_org_id_idx" ON "payments"("org_id");

-- CreateIndex
CREATE INDEX "message_logs_org_id_idx" ON "message_logs"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_line_user_id_key" ON "admin_users"("line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_oa_accounts" ADD CONSTRAINT "line_oa_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_line_oa_id_fkey" FOREIGN KEY ("line_oa_id") REFERENCES "line_oa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_plans" ADD CONSTRAINT "bill_plans_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_plans" ADD CONSTRAINT "bill_plans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_plans" ADD CONSTRAINT "bill_plans_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_installments" ADD CONSTRAINT "bill_installments_bill_plan_id_fkey" FOREIGN KEY ("bill_plan_id") REFERENCES "bill_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_line_oa_id_fkey" FOREIGN KEY ("line_oa_id") REFERENCES "line_oa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_matched_installment_id_fkey" FOREIGN KEY ("matched_installment_id") REFERENCES "bill_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_submission_id_fkey" FOREIGN KEY ("payment_submission_id") REFERENCES "payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_installment_id_fkey" FOREIGN KEY ("bill_installment_id") REFERENCES "bill_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_line_oa_id_fkey" FOREIGN KEY ("line_oa_id") REFERENCES "line_oa_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_bill_plan_id_fkey" FOREIGN KEY ("bill_plan_id") REFERENCES "bill_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_bill_installment_id_fkey" FOREIGN KEY ("bill_installment_id") REFERENCES "bill_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_payment_submission_id_fkey" FOREIGN KEY ("payment_submission_id") REFERENCES "payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

