import { mkdir, unlink } from "node:fs/promises";
import { join, dirname, resolve, sep } from "node:path";
import { env } from "../env";
import { getSystemSettings } from "./systemSettings";
import { logger } from "../lib/logger";

// Slip storage gateway. One driver, swappable at runtime by the super admin:
//   local  — disk (default, dev)
//   gdrive — Google Drive (service account), files under <root>/<orgId>/<lineOaId>/
// Path is always orgId/lineOaId/<file> so a tenant's OA bot keeps its own folder.
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
}

const slipKey = (orgId: string, lineOaId: string | null, submissionId: string, ext: string) =>
  `${orgId}/${lineOaId ?? "_"}/${submissionId}.${ext}`;

// ---------- local ----------
const localDriver: StorageDriver = {
  async put(key, data) {
    const path = join(env.localStoragePath, "slips", key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, data);
    return path;
  },
};

// ---------- google drive (REST, no SDK) ----------
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = Buffer.from(bytes as any).toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

const tokenCache = new Map<string, { token: string; exp: number }>();
async function driveToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const iat = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.file", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 };
  const head = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(claim)));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importPrivateKey(sa.private_key), Buffer.from(`${head}.${body}`));
  const jwt = `${head}.${body}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`gdrive token failed: ${res.status} ${await res.text()}`);
  const json: any = await res.json();
  tokenCache.set(sa.client_email, { token: json.access_token, exp: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

const folderCache = new Map<string, string>();
async function ensureFolder(token: string, name: string, parent: string): Promise<string> {
  const ck = `${parent}/${name}`;
  const hit = folderCache.get(ck);
  if (hit) return hit;
  const q = `name='${name}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list: any = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  let id = list.files?.[0]?.id;
  if (!id) {
    const created: any = await (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
    })).json();
    id = created.id;
  }
  folderCache.set(ck, id);
  return id;
}

function gdriveDriver(sa: any, rootFolderId: string): StorageDriver {
  return {
    async put(key, data, contentType) {
      const token = await driveToken(sa);
      const parts = key.split("/");
      const filename = parts.pop()!;
      let parent = rootFolderId;
      for (const dir of parts) parent = await ensureFolder(token, dir, parent);

      const boundary = `b${crypto.randomUUID()}`;
      const meta = JSON.stringify({ name: filename, parents: [parent] });
      const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
      const body = Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--`)]);
      const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!res.ok) throw new Error(`gdrive upload failed: ${res.status} ${await res.text()}`);
      const json: any = await res.json();
      return json.webViewLink ?? `gdrive:${json.id}`;
    },
  };
}

// ponytail: only local + gdrive exist. Add an s3 driver here when someone actually needs it.
async function resolveDriver(): Promise<StorageDriver> {
  const s = await getSystemSettings();
  if (s.storageDriver === "gdrive") {
    const sa = s.gdriveServiceAccount;
    if (sa?.client_email && sa?.private_key && s.gdriveRootFolderId) return gdriveDriver(sa, s.gdriveRootFolderId);
    // Don't drop the slip on misconfig — fall back to disk and shout.
    logger.error("storage driver=gdrive but service account / root folder missing; falling back to local");
    return localDriver;
  }
  return localDriver;
}

export async function storeSlip(orgId: string, lineOaId: string | null, submissionId: string, data: Buffer, ext = "jpg"): Promise<string> {
  const driver = await resolveDriver();
  const ct = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return driver.put(slipKey(orgId, lineOaId, submissionId, ext), data, ct);
}

export type DeleteSlipResult = "deleted" | "missing" | "skipped";

// Retention only deletes local files that resolve inside the configured storage root.
export async function deleteSlipFile(path: string): Promise<DeleteSlipResult> {
  const root = resolve(env.localStoragePath);
  const target = resolve(path);
  if (target !== root && !target.startsWith(root + sep)) return "skipped";
  try {
    await unlink(target);
    return "deleted";
  } catch (error: any) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}
