import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal HS256 JWT (no dependency). Sign + verify with constant-time signature check.
const b64url = (s: Buffer | string) => Buffer.from(s).toString("base64url");

export function signJwt(payload: Record<string, unknown>, secret: string, expSec = 7 * 86400): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expSec }));
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt<T = any>(token: string, secret: string): T {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, b, s] = parts;
  const expected = createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  const a = Buffer.from(s);
  const e = Buffer.from(expected);
  if (a.length !== e.length || !timingSafeEqual(a, e)) throw new Error("bad signature");
  const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error("token expired");
  return payload as T;
}
