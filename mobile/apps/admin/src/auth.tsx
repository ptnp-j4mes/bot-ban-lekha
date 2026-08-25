import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import Line, { Scope } from '@xmartlabs/react-native-line';
import { MobileApiError } from '../../../shared/src/api';
import type { AdminMe } from '../../../shared/src/types';
import { config } from './config';
import { api } from './api';
import { store } from './storage';

type AuthState = {
  status: 'loading' | 'signed_out' | 'signed_in';
  me: AdminMe | null;
  orgId: string | null;
  orgName: string | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithLine: () => Promise<void>;
  enterOrg: (org: { id: string; name: string }) => Promise<void>;
  exitOrg: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAdminAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return value;
}

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [me, setMe] = useState<AdminMe | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enterOrg = useCallback(async (org: { id: string; name: string }) => {
    await store.set('org_id', org.id);
    await store.set('org_name', org.name);
    setOrgId(org.id);
    setOrgName(org.name);
  }, []);

  const exitOrg = useCallback(async () => {
    await store.remove('org_id');
    await store.remove('org_name');
    setOrgId(null);
    setOrgName(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const current = await api.get<AdminMe>('/api/auth/me', { org: false });
      setMe(current);
      const savedOrg = await store.get('org_id');
      if (!current.is_platform_admin && current.org) {
        await enterOrg(current.org);
      } else if (savedOrg) {
        setOrgId(savedOrg);
        setOrgName(await store.get('org_name'));
      }
      setStatus('signed_in');
      setError(null);
    } catch (err) {
      await api.clearToken();
      setMe(null);
      setStatus('signed_out');
      setError(err instanceof MobileApiError ? err.message : 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
  }, [enterOrg]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (config.lineChannelId) await Line.setup({ channelId: config.lineChannelId });
      const token = await api.getToken();
      if (!alive) return;
      if (!token) {
        setStatus('signed_out');
        return;
      }
      await refresh();
    })().catch((err) => {
      if (alive) {
        setStatus('signed_out');
        setError(err instanceof Error ? err.message : 'เริ่มต้นแอปไม่สำเร็จ');
      }
    });
    return () => { alive = false; };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const result = await api.post<{ token: string }>('/api/auth/login', { username, password }, { auth: false, org: false });
    await api.setToken(result.token);
    await refresh();
  }, [refresh]);

  const loginWithLine = useCallback(async () => {
    setError(null);
    if (!config.lineChannelId) throw new Error('ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID ใน mobile app');
    const result = await Line.login({ scopes: [Scope.Profile, Scope.OpenId] });
    const idToken = result.accessToken?.idToken;
    if (!idToken) throw new Error('LINE ไม่ได้ส่ง ID token กลับมา');
    const session = await api.post<{ token: string }>('/api/auth/mobile/line', { id_token: idToken }, { auth: false, org: false });
    await api.setToken(session.token);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.clearToken();
    await exitOrg();
    setMe(null);
    setStatus('signed_out');
  }, [exitOrg]);

  const value = useMemo<AuthState>(() => ({ status, me, orgId, orgName, error, login, loginWithLine, enterOrg, exitOrg, logout, refresh }), [status, me, orgId, orgName, error, login, loginWithLine, enterOrg, exitOrg, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
