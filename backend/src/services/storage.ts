import { mkdir, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
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

export type DeleteSlipResult = "deleted" | "missing" | "skipped";

// Delete a slip file, but only if it resolves inside the configured local storage root.
// Refuses (returns "skipped") on anything outside that root — e.g. traversal, an S3 URL,
// or a path from a previous/different storage config — never throws on those.
export async function deleteSlipFile(path: string): Promise<DeleteSlipResult> {
  const root = resolve(env.localStoragePath);
  const target = resolve(path);
  if (target !== root && !target.startsWith(root + sep)) return "skipped";
  try {
    await unlink(target);
    return "deleted";
  } catch (e: any) {
    if (e?.code === "ENOENT") return "missing";
    throw e;
  }
}
