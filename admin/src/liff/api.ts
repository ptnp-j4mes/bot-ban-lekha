const BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_KEY = "liffSessionToken";

// Session token lives in sessionStorage (not localStorage) — a customer's balance data
// should not silently persist across LINE app restarts on a shared device.
export const getLiffToken = () => sessionStorage.getItem(TOKEN_KEY) || "";
export const setLiffToken = (t: string) => sessionStorage.setItem(TOKEN_KEY, t);
export const clearLiffToken = () => sessionStorage.removeItem(TOKEN_KEY);

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getLiffToken();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
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

export const liffGet = <T = any>(path: string) => req<T>(path);
export const liffPost = <T = any>(path: string, body?: unknown) =>
  req<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
