/**
 * @format
 */

import { MobileApi } from '../../../shared/src/api';
import { formatBaht } from '../../../shared/src/format';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from '../src/screens/LoginScreen';
import { DashboardScreen } from '../src/screens/DashboardScreen';

const mockLogin = jest.fn(async () => {});
const mockLoginWithLine = jest.fn(async () => {});
const mockNavigate = jest.fn();
const mockAdminApiGet = jest.fn(async (path: string) => {
  if (path.includes('/reports/summary')) return { collected: 1250, total_bill_amount: 4900, overdue_amount: 490, customers: 3 };
  if (path.includes('/reports/dashboard-charts')) return {
    period: 'month', year: 2026, month: 8,
    pie: { month: 8, total: 4900, collected: 1250, uncollected: 3650 },
    monthly: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, total: index === 7 ? 4900 : 0, collected: index === 7 ? 1250 : 0, uncollected: index === 7 ? 3650 : 0 })),
  };
  if (path.includes('payment-submissions')) return { items: [], total: 2 };
  return [];
});

jest.mock('../src/auth', () => ({
  useAdminAuth: () => ({ login: mockLogin, loginWithLine: mockLoginWithLine, orgName: 'ทดสอบ', logout: jest.fn(async () => {}) }),
}));
jest.mock('../src/api', () => ({ api: { get: (path: string) => mockAdminApiGet(path) } }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

function renderLogin() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <LoginScreen />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('mobile API sends bearer and org headers', async () => {
  const values = new Map([['jwt', 'token'], ['org', 'org-1']]);
  const store = { get: async (key: string) => values.get(key) ?? null, set: async () => {}, remove: async () => {} };
  const api = new MobileApi({ apiBaseUrl: 'https://api.test', lineChannelId: '' }, store, 'jwt', async () => values.get('org') ?? null);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    expect(init?.headers).toMatchObject({ authorization: 'Bearer token', 'x-org-id': 'org-1' });
    return { ok: true, status: 200, json: async () => ({ success: true, data: { ok: true } }) } as Response;
  }) as typeof fetch;
  try { await expect(api.get('/api/me')).resolves.toEqual({ ok: true }); } finally { globalThis.fetch = previousFetch; }
});

test('formats Thai baht values', () => expect(formatBaht(1250)).toContain('1,250'));

test('renders web-aligned admin login with LINE action', async () => {
  await renderLogin();
  expect(screen.getAllByText('เข้าสู่ระบบ')).toHaveLength(2);
  expect(screen.getByText('ลงชื่อเข้าใช้บัญชี')).toBeTruthy();
  expect(screen.getByText('หรือ')).toBeTruthy();
  expect(screen.getByText('เข้าสู่ระบบด้วย LINE')).toBeTruthy();
  expect(screen.getByLabelText('Username')).toBeTruthy();
  expect(screen.getByLabelText('Password')).toBeTruthy();
});

test('submits trimmed username and password', async () => {
  await renderLogin();
  await fireEvent.changeText(screen.getByLabelText('Username'), ' admin ');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
  await fireEvent.press(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  expect(mockLogin).toHaveBeenCalledWith('admin', 'secret');
});

test('calls native LINE login action', async () => {
  await renderLogin();
  await fireEvent.press(screen.getByText('เข้าสู่ระบบด้วย LINE'));
  expect(mockLoginWithLine).toHaveBeenCalledTimes(1);
});

test('shows loading state while login is pending', async () => {
  let resolveLogin: (() => void) | undefined;
  mockLogin.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveLogin = resolve; }));
  await renderLogin();
  await fireEvent.changeText(screen.getByLabelText('Username'), 'admin');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
  void fireEvent.press(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  expect(await screen.findByText('กำลังเข้าสู่ระบบ…')).toBeTruthy();
  resolveLogin?.();
  expect(await screen.findByRole('button', { name: 'เข้าสู่ระบบ' })).toBeTruthy();
});

test('renders dashboard Thai metrics from the admin API', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={client}><DashboardScreen /></QueryClientProvider>);
  expect(screen.getByText('ภาพรวมการเรียกเก็บ')).toBeTruthy();
  expect(screen.getAllByText('ครบกำหนดวันนี้').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('สลิปรอตรวจ')).toBeTruthy();
  expect(screen.getByText('ยอดเก็บวันนี้')).toBeTruthy();
  expect(screen.getByText('ยอดรวมบิลทั้งหมด')).toBeTruthy();
  expect(screen.getByText('วิเคราะห์ยอดบิล')).toBeTruthy();
  expect(await screen.findByText('สัดส่วนยอดเก็บ')).toBeTruthy();
  expect(await screen.findByText('ยอดรวมแต่ละเดือน')).toBeTruthy();
  expect(await screen.findByText('เก็บได้และยังเก็บไม่ได้รายเดือน')).toBeTruthy();
  expect(mockAdminApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/reports/dashboard-charts?period=month'));
  expect(screen.getByText('ทั้งระบบ')).toBeTruthy();
  expect(screen.getByText('รอตรวจ')).toBeTruthy();
  expect(screen.getByText('ยอดเก็บจริง')).toBeTruthy();
  expect(screen.getByText('QUICK ACTIONS')).toBeTruthy();
  expect(screen.getByText('สถานะวันนี้')).toBeTruthy();
  expect(screen.getByText('เมนูระบบ')).toBeTruthy();
  expect(screen.queryByText('฿')).toBeNull();
});

test('dashboard bento action keeps the existing route contract', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={client}><DashboardScreen /></QueryClientProvider>);
  await fireEvent.press(screen.getByText('ลูกค้า'));
  expect(mockNavigate).toHaveBeenCalledWith('Customers');
});
