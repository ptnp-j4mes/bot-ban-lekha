-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "gdrive_root_folder_id" TEXT,
ADD COLUMN     "gdrive_service_account" JSONB,
ADD COLUMN     "storage_driver" TEXT NOT NULL DEFAULT 'local';
