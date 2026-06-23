const BASE = import.meta.env.VITE_API_BASE ?? "";

// LINE-login JWT (primary) or a dev x-api-key fallback for local use without LINE.
export const getToken = () => localStorage.getItem("authToken") || "";
export const setToken = (t: string) => localStorage.setItem("authToken", t);
export const getDevKey = () => localStorage.getItem("adminKey") || "";
export const setDevKey = (k: string) => localStorage.setItem("adminKey", k);
export const getOrgId = () => localStorage.getItem("orgId") || "";
export const setOrgId = (id: string) => localStorage.setItem("orgId", id);
export const hasCreds = () => !!(getToken() || getDevKey());
export const clearAuth = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("adminKey");
  localStorage.removeItem("orgId");
};

export const loginUrl = `${BASE}/api/auth/line/login`;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = getToken();
  if (token) h.authorization = `Bearer ${token}`;
  else {
    const dev = getDevKey();
    if (dev) h["x-api-key"] = dev;
  }
  const org = getOrgId();
  if (org) h["x-org-id"] = org;
  return h;
}

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "content-type": "application/json", ...authHeaders(), ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) {
    const err: any = new Error(json.error?.message || `${res.status} error`);
    err.status = res.status;
    err.code = json.error?.code;
    throw err;
  }
  return json.data as T;
}

// Authenticated fetch returning the raw Response (for file downloads).
export const apiRaw = (path: string) => fetch(BASE + path, { headers: authHeaders() });

export const apiGet = <T = any>(path: string) => req<T>(path);
export const apiSend = <T = any>(path: string, method: string, body?: unknown) =>
  req<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
