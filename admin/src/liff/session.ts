import type { ConsentSelections, LiffConsent } from "./consent";
import type { Balance, Customer, CustomerData, CustomerLoad, Installment, PaymentHistory, Tab } from "./model";

export interface LiffSdk {
  init(config: { liffId: string }): Promise<unknown>;
  isLoggedIn(): boolean;
  isInClient(): boolean;
  login(): void;
  getIDToken(): string | null;
  closeWindow(): void;
}
export type Session = { token: string; customer: Customer; consent: LiffConsent | null };
export type SessionProblem = "not_configured" | "sdk_unavailable" | "pending_registration" | "unauthorized";
export class LiffSessionError extends Error {
  kind: SessionProblem;
  constructor(kind: SessionProblem) { super(kind); this.name = "LiffSessionError"; this.kind = kind; }
}

export function readInitialTab(pathname: string, search: string): Tab {
  const path = pathname.replace(/\/+$/, "");
  return path === "/liff.html/open-bill" || new URLSearchParams(search).get("view") === "open-bill" ? "document" : "unpaid";
}

export interface CustomerApi {
  clearToken(): void;
  setToken(token: string): void;
  createSession(idToken: string, oaId: string, signal: AbortSignal): Promise<Session>;
  getBalance(signal: AbortSignal): Promise<Balance>;
  getInstallments(signal: AbortSignal): Promise<Installment[]>;
  getPayments(signal: AbortSignal): Promise<PaymentHistory[]>;
  saveConsent(selection: ConsentSelections, signal: AbortSignal): Promise<{ consent: LiffConsent }>;
}

/** Read only, after init: never rewrite SDK-owned liff.* query parameters. */
export function readOaId(search: string): string | null {
  const params = new URLSearchParams(search);
  const direct = params.get("oa")?.trim();
  if (direct) return direct;
  const state = params.get("liff.state");
  if (!state) return null;
  try {
    return new URL(state, "https://liff.local").searchParams.get("oa")?.trim() || null;
  } catch { return null; }
}

export async function loadCustomerData({ sdk, liffId, getSearch, api, signal }: {
  sdk?: LiffSdk; liffId?: string; getSearch: () => string; api: CustomerApi; signal: AbortSignal;
}): Promise<CustomerLoad | null> {
  signal.throwIfAborted();
  // Always re-bind a page/refresh to LINE's verified current user and OA.
  // A sessionStorage token alone cannot prove that the LINE account has not changed.
  api.clearToken();
  if (!liffId) throw new LiffSessionError("not_configured");
  if (!sdk) throw new LiffSessionError("sdk_unavailable");
  await sdk.init({ liffId });
  signal.throwIfAborted();
  const oaId = readOaId(getSearch());
  if (!oaId) throw new LiffSessionError("not_configured");
  if (!sdk.isLoggedIn()) {
    if (sdk.isInClient()) throw new LiffSessionError("unauthorized");
    sdk.login();
    return null;
  }
  const idToken = sdk.getIDToken();
  if (!idToken) throw new LiffSessionError("unauthorized");
  let session: Session;
  try { session = await api.createSession(idToken, oaId, signal); }
  catch (error) {
    if ((error as { code?: string })?.code === "NOT_FOUND") throw new LiffSessionError("pending_registration");
    throw error;
  }
  signal.throwIfAborted();
  api.setToken(session.token);
  if (session.consent === null) return { customer: session.customer, consent: null };
  const [balance, installments, payments] = await Promise.all([
    api.getBalance(signal), api.getInstallments(signal), api.getPayments(signal),
  ]);
  signal.throwIfAborted();
  return { customer: session.customer, consent: session.consent, balance, installments, payments };
}
