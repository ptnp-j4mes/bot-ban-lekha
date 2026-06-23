import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../env";

// ponytail: local-disk driver only. S3 driver slots in here behind same fn when STORAGE_DRIVER=s3.
export async function storeSlip(submissionId: string, data: Buffer, ext = "jpg"): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dir = join(env.localStoragePath, "slips", yyyy, mm);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${submissionId}.${ext}`);
  await Bun.write(path, data);
  return path;
}
