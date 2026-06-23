-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "bill_footer" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok';
