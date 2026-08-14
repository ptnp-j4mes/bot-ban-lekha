import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { apiGet, clearAuth, hasCreds, setToken, getOrgId, setOrgId } from "./api";

type Org = { id: string; name: string };
export type MenuGroup = { label: string; items: string[] };
export type MenuPrefs = { order?: string[]; hidden?: string[]; groups?: MenuGroup[] };
type Me = { userId: string; name?: string; isPlatformAdmin: boolean; org?: Org | null; menuPrefs?: MenuPrefs | null };

type AuthState = {
  me?: Me;
  loading: boolean;
  isPlatformAdmin: boolean;
  orgId: string;
  orgName: string;
  impersonating: boolean; // super admin currently inside a user's org
  enterOrg: (org: Org) => void;
  exitOrg: () => void;
  canWrite: boolean; // any member = full access
  menuPrefs?: MenuPrefs | null;
  logout: () => void;
};

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [orgId, setOrgIdState] = useState(getOrgId());
  const [orgName, setOrgName] = useState(localStorage.getItem("orgName") || "");

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get("token");
    const err = h.get("error");
    if (token) setToken(token);
    if (err) toast.error(`เข้าสู่ระบบไม่สำเร็จ: ${err}`);
    if (token || err) history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);

  const me = useQuery<any>({ queryKey: ["me"], queryFn: () => apiGet("/api/auth/me"), enabled: ready && hasCreds(), retry: false });
  const data: Me | undefined = me.data
    ? { userId: me.data.user_id, name: me.data.name, isPlatformAdmin: !!me.data.is_platform_admin, org: me.data.org ?? null, menuPrefs: me.data.menu_prefs ?? null }
    : undefined;

  // A normal user always operates inside their own org — pin it.
  useEffect(() => {
    if (data && !data.isPlatformAdmin && data.org && orgId !== data.org.id) {
      setOrgId(data.org.id);
      setOrgIdState(data.org.id);
      setOrgName(data.org.name);
      localStorage.setItem("orgName", data.org.name);
    }
  }, [me.data]);

  const enterOrg = (org: Org) => {
    setOrgId(org.id);
    localStorage.setItem("orgName", org.name);
    setOrgIdState(org.id);
    setOrgName(org.name);
    qc.invalidateQueries();
  };
  const exitOrg = () => {
    localStorage.removeItem("orgId");
    localStorage.removeItem("orgName");
    setOrgIdState("");
    setOrgName("");
    qc.invalidateQueries();
  };
  const logout = () => {
    clearAuth();
    qc.clear();
    window.location.reload();
  };

  const isPlatformAdmin = !!data?.isPlatformAdmin;
  const value: AuthState = {
    me: data,
    loading: !ready || (hasCreds() && me.isLoading),
    isPlatformAdmin,
    orgId,
    orgName,
    impersonating: isPlatformAdmin && !!orgId,
    enterOrg,
    exitOrg,
    canWrite: true,
    menuPrefs: data?.menuPrefs ?? null,
    logout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
