CREATE TABLE "admin_login_completions" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "challenge_hash" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_login_completions_code_hash_key" ON "admin_login_completions"("code_hash");
CREATE INDEX "admin_login_completions_expires_at_idx" ON "admin_login_completions"("expires_at");
CREATE INDEX "admin_login_completions_admin_user_id_expires_at_idx" ON "admin_login_completions"("admin_user_id", "expires_at");

ALTER TABLE "admin_login_completions" ADD CONSTRAINT "admin_login_completions_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
