import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert, Linking, Text } from 'react-native';
import Line, { Scope } from '@xmartlabs/react-native-line';
import { MobileApiError } from '../../../shared/src/api';
import { parseCustomerOaId } from '../../../shared/src/deepLink';
import { Button, Card, Header, Screen } from '../../../shared/src/ui';
import { useColors } from '../../../shared/src/theme';
import { config } from './config';
import { api } from './api';
import { store } from './storage';

type CustomerStage = 'loading' | 'needs_oa' | 'needs_login' | 'ready' | 'not_linked' | 'error';
type CustomerAuthState = {
  stage: CustomerStage;
  oaId: string | null;
  displayName: string | null;
  error: string | null;
  loginWithLine: () => Promise<void>;
  logout: () => Promise<void>;
  setOaFromLink: (url: string) => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function useCustomerAuth() {
  const value = useContext(CustomerAuthContext);
  if (!value) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider');
  return value;
}

export function CustomerAuthProvider({ children }: PropsWithChildren) {
  const [stage, setStage] = useState<CustomerStage>('loading');
  const [oaId, setOaId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setOaFromLink = useCallback(async (url: string) => {
    const next = parseCustomerOaId(url);
    if (!next) return;
    const current = await store.get('oa_id');
    if (current && current !== next) await api.clearToken();
    await store.set('oa_id', next);
    setOaId(next);
    setDisplayName(null);
    setError(null);
    setStage('needs_login');
  }, []);

  useEffect(() => {
    let alive = true;
    const onUrl = ({ url }: { url: string }) => { void setOaFromLink(url); };
    const subscription = Linking.addEventListener('url', onUrl);
    (async () => {
      if (config.lineChannelId) await Line.setup({ channelId: config.lineChannelId });
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) await setOaFromLink(initialUrl);
      const savedOa = (await store.get('oa_id')) || config.defaultOaId || null;
      if (savedOa && !(await store.get('oa_id'))) await store.set('oa_id', savedOa);
      const token = await api.getToken();
      if (!alive) return;
      setOaId(savedOa);
      if (!savedOa) { setStage('needs_oa'); return; }
      if (!token) { setStage('needs_login'); return; }
      try {
        const me = await api.get<{ display_name: string | null; customer_code: string }>('/api/liff/me', { org: false });
        setDisplayName(me.display_name || me.customer_code);
        setStage('ready');
      } catch (err) {
        await api.clearToken();
        setStage(err instanceof MobileApiError && err.code === 'NOT_FOUND' ? 'not_linked' : 'needs_login');
        setError(err instanceof Error ? err.message : 'เซสชันหมดอายุ');
      }
    })().catch((err) => { if (alive) { setStage('error'); setError(err instanceof Error ? err.message : 'เริ่มต้นแอปไม่สำเร็จ'); } });
    return () => { alive = false; subscription.remove(); };
  }, [setOaFromLink]);

  const loginWithLine = useCallback(async () => {
    setError(null);
    const currentOa = oaId || (await store.get('oa_id'));
    if (!currentOa) { setStage('needs_oa'); throw new Error('กรุณาเปิดแอปจากลิงก์ขององค์กรก่อน'); }
    if (!config.lineChannelId) throw new Error('ยังไม่ได้ตั้งค่า LINE_LIFF_CHANNEL_ID ใน mobile app');
    const result = await Line.login({ scopes: [Scope.Profile, Scope.OpenId] });
    const idToken = result.accessToken?.idToken;
    if (!idToken) throw new Error('LINE ไม่ได้ส่ง ID token กลับมา');
    try {
      const session = await api.post<{ token: string; customer: { display_name: string | null; customer_code: string } }>('/api/liff/session', { id_token: idToken, oa_id: currentOa }, { auth: false, org: false });
      await api.setToken(session.token);
      setDisplayName(session.customer.display_name || session.customer.customer_code);
      setOaId(currentOa);
      setStage('ready');
    } catch (err) {
      const apiError = err as MobileApiError;
      setStage(apiError.code === 'NOT_FOUND' ? 'not_linked' : 'error');
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      throw err;
    }
  }, [oaId]);

  const logout = useCallback(async () => {
    await api.clearToken();
    setDisplayName(null);
    setStage(oaId ? 'needs_login' : 'needs_oa');
  }, [oaId]);

  const value = useMemo(() => ({ stage, oaId, displayName, error, loginWithLine, logout, setOaFromLink }), [stage, oaId, displayName, error, loginWithLine, logout, setOaFromLink]);
  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function CustomerLoginPrompt() {
  const colors = useColors();
  const { stage, oaId, error, loginWithLine } = useCustomerAuth();
  const message = stage === 'needs_oa'
    ? 'กรุณาเปิดลิงก์จากผู้ดูแลเพื่อเลือกองค์กร'
    : stage === 'not_linked'
      ? 'บัญชี LINE นี้ยังไม่ได้ผูกกับข้อมูลลูกค้า กรุณาติดต่อแอดมินค่ะ'
      : error || `OA: ${oaId ?? '-'}`;
  return <Screen><Header eyebrow="Bill Customer" title="ยอดคงเหลือของฉัน" /><Card><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{message}</Text>{stage === 'needs_login' ? <Button title="เข้าสู่ระบบด้วย LINE" onPress={() => loginWithLine().catch((err) => Alert.alert('เข้าสู่ระบบไม่สำเร็จ', err instanceof Error ? err.message : 'กรุณาลองใหม่'))} /> : null}</Card></Screen>;
}
