-- CreateTable
CREATE TABLE "line_groups" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "line_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "line_groups_org_id_idx" ON "line_groups"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "line_groups_org_id_line_group_id_key" ON "line_groups"("org_id", "line_group_id");
