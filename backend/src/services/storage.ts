import { mkdir, unlink } from "node:fs/promises";
import { join, dirname, resolve, sep } from "node:path";
import { env } from "../env";
import { getSystemSettings } from "./systemSettings";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

// Slip storage gateway. One driver, swappable at runtime by the super admin:
//   local  — disk (default, dev)
//   gdrive — Google Drive (service account), files under <org folder>/slip/<line user folder>/
//   s3     — AWS S3 or any S3-compatible endpoint
// The managed org folder is tagged with orgId in Drive appProperties so duplicate names stay isolated.
export type StorageDriverName = "local" | "gdrive" | "s3";

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string, context?: { orgId?: string; orgName?: string; orgFolderId?: string; userId?: string; userName?: string }): Promise<string>;
}

const safeFolderName = (name: string, fallback: string) => (name.replace(/[\\/]/g, "-").trim().slice(0, 120) || fallback);
const slipKey = (orgId: string, submissionId: string, ext: string) => `${orgId}/slip/${submissionId}.${ext}`;

// ---------- local ----------
const localDriver: StorageDriver = {
  async put(key, data) {
    const path = join(env.localStoragePath, "slips", key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, data);
    return path;
  },
};

type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicBaseUrl: string;
  prefix: string;
};

function s3Config(): S3Config | null {
  const bucket = env.s3Bucket.trim();
  const region = env.s3Region.trim();
  const accessKeyId = env.s3AccessKeyId.trim();
  const secretAccessKey = env.s3SecretAccessKey.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;

  const endpoint = env.s3Endpoint.trim() || `https://s3.${region}.amazonaws.com`;
  try {
    new URL(endpoint);
  } catch {
    return null;
  }
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: endpoint.replace(/\/$/, ""),
    publicBaseUrl: env.s3PublicBaseUrl.trim().replace(/\/$/, ""),
    prefix: env.s3Prefix.trim().replace(/^\/+|\/+$/g, ""),
  };
}

function s3MissingConfig(): string[] {
  const missing: string[] = [];
  if (!env.s3Bucket.trim()) missing.push("S3_BUCKET");
  if (!env.s3Region.trim()) missing.push("S3_REGION");
  if (!env.s3AccessKeyId.trim()) missing.push("S3_ACCESS_KEY_ID");
  if (!env.s3SecretAccessKey.trim()) missing.push("S3_SECRET_ACCESS_KEY");
  if (env.s3Endpoint.trim()) {
    try { new URL(env.s3Endpoint.trim()); } catch { missing.push("S3_ENDPOINT (URL ไม่ถูกต้อง)"); }
  }
  return missing;
}

export function getStorageConfigStatus(
  settings: Awaited<ReturnType<typeof getSystemSettings>>,
  driver: StorageDriverName = settings.storageDriver as StorageDriverName,
) {
  if (driver === "local") return { driver, configured: true, missing: [] as string[] };
  if (driver === "gdrive") {
    const missing: string[] = [];
    if (!settings.gdriveServiceAccount?.client_email) missing.push("Google service account client_email");
    if (!settings.gdriveServiceAccount?.private_key) missing.push("Google service account private_key");
    if (!settings.gdriveRootFolderId) missing.push("Google Drive root folder ID");
    return { driver, configured: missing.length === 0, missing };
  }
  if (driver === "s3") {
    const missing = s3MissingConfig();
    return { driver, configured: missing.length === 0, missing };
  }
  return { driver, configured: false, missing: [`storage driver '${driver}' ไม่รองรับ`] };
}

function storageObjectKey(config: S3Config, key: string) {
  return config.prefix ? `${config.prefix}/${key}` : key;
}

function awsUriEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function s3Address(config: S3Config, key: string) {
  const base = new URL(config.endpoint);
  const objectPath = `${base.pathname.replace(/\/$/, "")}/${awsUriEncode(config.bucket)}/${key.split("/").map(awsUriEncode).join("/")}`;
  return { url: `${base.origin}${objectPath}`, canonicalUri: objectPath || "/", host: base.host };
}

function bytes(input: string | Uint8Array) {
  return typeof input === "string" ? new TextEncoder().encode(input) : input;
}

function hex(input: Uint8Array) {
  return Array.from(input, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string | Uint8Array) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(input))));
}

async function hmacSha256(key: string | Uint8Array, input: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, bytes(input)));
}

async function s3Request(config: S3Config, method: "GET" | "PUT", key: string, body?: Uint8Array, contentType?: string, fullObjectKey = false) {
  const objectKey = fullObjectKey ? key : storageObjectKey(config, key);
  const payloadHash = await sha256Hex(body ?? new Uint8Array());
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const address = s3Address(config, objectKey);
  const headerValues: Record<string, string> = {
    host: address.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headerValues["content-type"] = contentType;
  const canonicalHeaders = Object.keys(headerValues).sort().map((name) => `${name}:${headerValues[name].trim()}`).join("\n");
  const signedHeaders = Object.keys(headerValues).sort().join(";");
  const canonicalRequest = `${method}\n${address.canonicalUri}\n\n${canonicalHeaders}\n\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;
  const dateKey = await hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, config.region);
  const serviceKey = await hmacSha256(regionKey, "s3");
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = hex(await hmacSha256(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = new Headers({ ...headerValues, Authorization: authorization });
  const response = await fetch(address.url, { method, headers, body: method === "PUT" ? body : undefined });
  if (!response.ok) throw new Error(`S3 ${method} failed: ${response.status}`);
  return response;
}

function s3Driver(config: S3Config): StorageDriver {
  return {
    async put(key, data, contentType) {
      const objectKey = storageObjectKey(config, key);
      await s3Request(config, "PUT", key, data, contentType);
      if (config.publicBaseUrl) return `${config.publicBaseUrl}/${objectKey.split("/").map(awsUriEncode).join("/")}`;
      return `s3://${config.bucket}/${objectKey}`;
    },
  };
}

export async function readS3Object(reference: string): Promise<Response> {
  const parsed = new URL(reference);
  const config = s3Config();
  if (!config || parsed.protocol !== "s3:" || parsed.hostname !== config.bucket) throw new Error("S3 is not configured");
  const objectKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const response = await s3Request(config, "GET", objectKey, undefined, undefined, true);
  return new Response(response.body, { headers: { "content-type": response.headers.get("content-type") ?? "application/octet-stream" } });
}

// ---------- google drive (REST, no SDK) ----------
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = Buffer.from(bytes as any).toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const tokenCache = new Map<string, { token: string; exp: number }>();
async function driveToken(sa: { client_email: string; private_key: string }, scope = DRIVE_FILE_SCOPE): Promise<string> {
  const cacheKey = `${sa.client_email}:${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const iat = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 };
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
  tokenCache.set(cacheKey, { token: json.access_token, exp: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

async function driveJson(sa: { client_email: string; private_key: string }, url: string, init: RequestInit = {}, scope = DRIVE_READ_SCOPE): Promise<any> {
  const token = await driveToken(sa, scope);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive API request failed (${res.status})`);
  return json;
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

const driveQueryValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function ensureManagedFolder(
  token: string,
  name: string,
  parent: string,
  properties: Record<string, string>,
): Promise<string> {
  const props = Object.entries(properties)
    .map(([key, value]) => `appProperties has { key='${driveQueryValue(key)}' and value='${driveQueryValue(value)}' }`)
    .join(" and ");
  const q = `'${driveQueryValue(parent)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and ${props}`;
  const list: any = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  let id = list.files?.[0]?.id;
  if (!id) {
    const created: any = await (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent], appProperties: properties }),
    })).json();
    id = created.id;
  }
  if (!id) throw new Error("Google Drive folder could not be created");
  return id;
}

type DriveFileView = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

function driveConfig(s: Awaited<ReturnType<typeof getSystemSettings>>) {
  return s.gdriveServiceAccount?.client_email && s.gdriveServiceAccount?.private_key && s.gdriveRootFolderId
    ? { serviceAccount: s.gdriveServiceAccount as { client_email: string; private_key: string }, rootFolderId: s.gdriveRootFolderId }
    : null;
}

export async function getGoogleDriveStatus() {
  const s = await getSystemSettings();
  const config = driveConfig(s);
  if (!config) {
    return { configured: false, connected: false, storage_driver: s.storageDriver, root_folder_id: s.gdriveRootFolderId, service_account_email: null, root: null };
  }

  try {
    const root = await driveJson(config.serviceAccount, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.rootFolderId)}?fields=id,name,mimeType,webViewLink,trashed,parents`);
    if (root.trashed || root.mimeType !== "application/vnd.google-apps.folder") throw new Error("Root folder is unavailable");
    return {
      configured: true,
      connected: true,
      storage_driver: s.storageDriver,
      root_folder_id: config.rootFolderId,
      service_account_email: config.serviceAccount.client_email,
      root: { id: root.id, name: root.name, mime_type: root.mimeType, web_view_link: root.webViewLink ?? null, parents: root.parents ?? [] },
    };
  } catch (error) {
    logger.error({ err: error, rootFolderId: config.rootFolderId }, "google drive connection test failed");
    return {
      configured: true,
      connected: false,
      storage_driver: s.storageDriver,
      root_folder_id: config.rootFolderId,
      service_account_email: config.serviceAccount.client_email,
      root: null,
      error: "เชื่อมต่อ Google Drive ไม่สำเร็จ ตรวจสอบสิทธิ์โฟลเดอร์และเปิด Drive API แล้วหรือยัง",
    };
  }
}

export async function listGoogleDriveFolder(folderId?: string) {
  const s = await getSystemSettings();
  const config = driveConfig(s);
  if (!config) throw new Error("Google Drive is not configured");
  const currentId = folderId || config.rootFolderId;
  const chain: { id: string; name: string; web_view_link?: string | null }[] = [];
  let cursor = currentId;
  for (let i = 0; i < 20; i++) {
    const current: any = await driveJson(config.serviceAccount, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cursor)}?fields=id,name,mimeType,webViewLink,parents,trashed`);
    if (current.trashed || current.mimeType !== "application/vnd.google-apps.folder") throw new Error("Google Drive folder is unavailable");
    chain.unshift({ id: current.id, name: current.name, web_view_link: current.webViewLink ?? null });
    if (cursor === config.rootFolderId) break;
    cursor = current.parents?.[0];
    if (!cursor) throw new Error("Folder is outside the configured Root Folder");
  }
  if (chain[0]?.id !== config.rootFolderId) throw new Error("Folder is outside the configured Root Folder");

  const q = `'${driveQueryValue(currentId)}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    pageSize: "100",
    orderBy: "folder,name",
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
  });
  const result = await driveJson(config.serviceAccount, `https://www.googleapis.com/drive/v3/files?${params}`);
  return {
    folder: chain[chain.length - 1],
    breadcrumbs: chain,
    files: (result.files ?? []) as DriveFileView[],
  };
}

function gdriveDriver(sa: any, rootFolderId: string): StorageDriver {
  return {
    async put(key, data, contentType, context) {
      const token = await driveToken(sa, DRIVE_FILE_SCOPE);
      const filename = key.split("/").pop()!;
      let parent = context?.orgFolderId || rootFolderId;
      if (context?.orgId) {
        if (!context.orgFolderId) {
          parent = await ensureManagedFolder(token, safeFolderName(context.orgName ?? context.orgId, context.orgId), rootFolderId, { farmhub_org_id: context.orgId });
        }
        parent = await ensureManagedFolder(token, "slip", parent, { farmhub_org_id: context.orgId, farmhub_folder_type: "slip" });
        const userId = context.userId || "unknown-user";
        const userName = context.userName?.trim();
        const userFolderName = safeFolderName(userName ? `${userId}-${userName}` : userId, userId);
        parent = await ensureManagedFolder(token, userFolderName, parent, {
          farmhub_org_id: context.orgId,
          farmhub_folder_type: "user",
          farmhub_user_id: userId,
        });
      } else {
        const parts = key.split("/");
        parts.pop();
        for (const dir of parts) parent = await ensureFolder(token, dir, parent);
      }

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

async function resolveDriver(): Promise<StorageDriver> {
  const s = await getSystemSettings();
  const status = getStorageConfigStatus(s);
  if (!status.configured) {
    throw new Error(`Storage driver ${status.driver} is not configured: ${status.missing.join(", ")}`);
  }
  if (s.storageDriver === "gdrive") {
    const sa = s.gdriveServiceAccount;
    return gdriveDriver(sa, s.gdriveRootFolderId!);
  }
  if (s.storageDriver === "s3") {
    return s3Driver(s3Config()!);
  }
  return localDriver;
}

export async function storeSlip(
  orgId: string,
  lineOaId: string | null,
  submissionId: string,
  data: Buffer,
  ext = "jpg",
  sender?: { userId?: string | null; userName?: string | null },
): Promise<string> {
  const driver = await resolveDriver();
  const ct = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, gdriveFolderId: true } });
  return driver.put(slipKey(orgId, submissionId, ext), data, ct, {
    orgId,
    orgName: org?.name ?? orgId,
    orgFolderId: org?.gdriveFolderId ?? undefined,
    userId: sender?.userId ?? undefined,
    userName: sender?.userName ?? undefined,
  });
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
