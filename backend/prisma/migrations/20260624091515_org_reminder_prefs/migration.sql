-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "deadline_hour" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "reminder_hour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "reminder_text" TEXT;
