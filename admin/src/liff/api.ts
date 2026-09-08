const BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_KEY = "liffSessionToken";
// Never use localStorage for private customer sessions. Some WebViews disable
// storage entirely; retain a page-only token in that case and still allow logout.
let pageToken: string | null = null;
export function getLiffToken(): string {
  if (pageToken !== null) return pageToken;
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
export function setLiffToken(token: string): void {
  pageToken = token;
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* Page-only session. */ }
}
export function clearLiffToken(): void {
  pageToken = "";
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* Storage may be disabled. */ }
}
export class LiffApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message); this.name = "LiffApiError"; this.status = status; this.code = code;
  }
}
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getLiffToken();
  const res = await fetch(BASE + path, {
    ...opts,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const json = await res.json().catch(() => null) as {
    success?: boolean; data?: T; error?: { message?: string; code?: string };
  } | null;
  if (!res.ok || !json?.success) {
    throw new LiffApiError(json?.error?.message || `${res.status} error`, res.status, json?.error?.code);
  }
  return json.data as T;
}
export const liffGet = <T = unknown>(path: string, signal?: AbortSignal) => req<T>(path, { signal });
export const liffPost = <T = unknown>(path: string, body?: unknown, signal?: AbortSignal) =>
  req<T>(path, { method: "POST", signal, body: body === undefined ? undefined : JSON.stringify(body) });
