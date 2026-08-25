import type { MobileConfig, TokenStore } from './types';

type RequestInitLike = { method?: string; headers?: Record<string, string>; body?: string };
type ResponseLike = { ok: boolean; status: number; json: () => Promise<any> };
declare const fetch: (input: string, init?: RequestInitLike) => Promise<ResponseLike>;

export class MobileApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'MobileApiError';
    this.status = status;
    this.code = code;
  }
}

export class MobileApi {
  constructor(
    private readonly config: MobileConfig,
    private readonly store: TokenStore,
    private readonly tokenKey: string,
    private readonly getOrgId: () => Promise<string | null> = async () => null,
  ) {}

  async setToken(token: string) {
    await this.store.set(this.tokenKey, token);
  }

  async clearToken() {
    await this.store.remove(this.tokenKey);
  }

  async getToken() {
    return this.store.get(this.tokenKey);
  }

  async request<T>(path: string, init: RequestInitLike = {}, options: { auth?: boolean; org?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (options.auth !== false) {
      const token = await this.getToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    if (options.org !== false) {
      const orgId = await this.getOrgId();
      if (orgId) headers['x-org-id'] = orgId;
    }

    const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}${path}`, { ...init, headers });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      throw new MobileApiError(json.error?.message || `${response.status} error`, response.status, json.error?.code);
    }
    return json.data as T;
  }

  get<T>(path: string, options?: { auth?: boolean; org?: boolean }) {
    return this.request<T>(path, {}, options);
  }

  post<T>(path: string, body?: unknown, options?: { auth?: boolean; org?: boolean }) {
    return this.request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, options);
  }

  patch<T>(path: string, body?: unknown, options?: { auth?: boolean; org?: boolean }) {
    return this.request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }, options);
  }

  async raw(path: string) {
    const token = await this.getToken();
    const orgId = await this.getOrgId();
    return fetch(`${this.config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { 'x-org-id': orgId } : {}),
      },
    });
  }
}
