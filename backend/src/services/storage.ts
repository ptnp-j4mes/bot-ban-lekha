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

const storageRoot = () => resolve(env.localStoragePath);

// Path-confinement check: refuse to touch anything outside the configured storage directory,
// even if a stored path were ever malformed or tampered with.
function isInsideStorageRoot(path: string): boolean {
  const root = storageRoot();
  const resolved = resolve(path);
  return resolved === root || resolved.startsWith(root + sep);
}

// Delete a previously-stored slip file. Never throws on a missing file or a path outside
// the storage root — purge is best-effort and must never take down the caller (payment flow).
export async function deleteSlipFile(path: string | null | undefined): Promise<"deleted" | "missing" | "skipped"> {
  if (!path || !isInsideStorageRoot(path)) return "skipped";
  try {
    await unlink(path);
    return "deleted";
  } catch (e: any) {
    if (e?.code === "ENOENT") return "missing";
    throw e;
  }
}
