import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BanksScreen } from '../src/screens/BanksScreen';
import { BillsScreen } from '../src/screens/BillsScreen';
import { ComingSoonScreen } from '../src/screens/ComingSoonScreen';
import { CustomerDetailScreen, CustomersScreen } from '../src/screens/CustomersScreen';
import { ChatCloneScreen } from '../src/screens/AdminWebScreens';
import { PlatformScreen } from '../src/screens/PlatformScreen';
import { SubmissionsScreen } from '../src/screens/SubmissionsScreen';

jest.mock('../src/api', () => ({
  api: {
    get: jest.fn(async (path: string) => {
      if (path.includes('/api/customers?limit=50')) return { items: [], total: 0 };
      if (path === '/api/customers/customer-1/detail') return { customer: { id: 'customer-1', customer_code: 'LINE-FA1C237B', display_name: null, phone: null, line_user_id: null, status: 'active' }, bill_plans: [{ id: 'bill-1', bill_no: 1, principal_amount: 3000, installment_amount: 1000, total_installments: 3, status: 'completed', installments: [{ id: 'installment-1', installment_no: 1, due_date: '2026-08-31', amount_due: 1000, amount_paid: 1000, status: 'paid' }] }] };
      if (path.includes('/api/customers?limit=100')) return { items: [{ id: 'customer-1', customer_code: 'LINE-FA1C237B', display_name: null, phone: null, line_user_id: null, status: 'active' }] };
      if (path === '/api/bill-plans') return [];
      if (path === '/api/bank-accounts') return [];
      if (path.includes('/api/admin/payment-submissions')) return { items: [], total: 0 };
      if (path.includes('/api/conversations?')) return { items: [{ key: 'U123', line_user_id: 'U123', title: 'คุณสมชาย', customer: { customer_code: 'CUS-001' }, message_count: 1, last_message: 'สอบถามยอดค้างชำระ', last_direction: 'inbound', last_message_type: 'text', last_status: 'received', last_message_at: '2026-08-24T04:00:00.000Z' }], total: 1 };
      if (path === '/api/conversations/U123') return { conversation: { key: 'U123', line_user_id: 'U123', title: 'คุณสมชาย', customer: { customer_code: 'CUS-001' }, message_count: 1 }, messages: [{ id: 'M123', direction: 'inbound', message_type: 'text', message_text: 'ข้อความทดสอบ', status: 'received', sent_at: '2026-08-24T04:00:00.000Z' }] };
      if (path.includes('/api/platform/organizations')) return { items: [] };
      return [];
    }),
    post: jest.fn(async () => ({})),
    patch: jest.fn(async () => ({})),
  },
}));

jest.mock('../src/auth', () => ({
  useAdminAuth: () => ({ orgName: 'ทดสอบ', enterOrg: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useNavigationState: () => ({ routes: [{ name: 'Dashboard' }], index: 0 }),
}));

function renderWithQuery(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

test('existing admin data screens keep their Thai headers and empty states', async () => {
  await renderWithQuery(<CustomersScreen />);
  expect(screen.getByText('ลูกค้า')).toBeTruthy();
  expect(await screen.findByText('ยังไม่มีลูกค้า')).toBeTruthy();
  await cleanup();

  await renderWithQuery(<BillsScreen />);
  expect(screen.getAllByText('สร้างบิล').length).toBeGreaterThan(0);
  expect(await screen.findByText('ยังไม่มีบิล')).toBeTruthy();
  await cleanup();

  await renderWithQuery(<BanksScreen />);
  expect(screen.getByText('บัญชีรับโอน')).toBeTruthy();
  expect(await screen.findByText('ยังไม่มีบัญชีรับโอน')).toBeTruthy();
  await cleanup();

  await renderWithQuery(<SubmissionsScreen />);
  expect(screen.getByText('สลิป / อนุมัติ (0)')).toBeTruthy();
  expect(await screen.findByText('ไม่มีสลิปรอตรวจ')).toBeTruthy();
  await cleanup();
});

test('customer detail can link a LINE user id', async () => {
  const mockApiPost = jest.requireMock('../src/api').api.post as jest.Mock;
  mockApiPost.mockClear();
  await renderWithQuery(<CustomerDetailScreen route={{ params: { id: 'customer-1', name: 'LINE-FA1C237B' } }} />);
  expect(await screen.findByText('ผูกกับ LINE user')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Uxxxxxxxx'), ' U123 ');
  await waitFor(() => expect(screen.getByPlaceholderText('Uxxxxxxxx').props.value).toBe(' U123 '));
  fireEvent(screen.getByRole('button', { name: 'ผูก LINE' }), 'click');
  await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/customers/link-line', { customer_code: 'LINE-FA1C237B', line_user_id: 'U123' }));
});

test('customer detail opens a bill detail when a bill card is pressed', async () => {
  await renderWithQuery(<CustomerDetailScreen route={{ params: { id: 'customer-1', name: 'LINE-FA1C237B' } }} />);
  fireEvent.press(await screen.findByLabelText('เปิดรายละเอียดบิล 1'));
  expect(await screen.findByText('รายละเอียดบิล')).toBeTruthy();
  expect(screen.getByText('สรุปบิล')).toBeTruthy();
  expect(screen.getByText('รายการงวด (1)')).toBeTruthy();
  expect(screen.getByText('งวดที่ 1')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('ปิดรายละเอียดบิล'));
  await waitFor(() => expect(screen.queryByText('รายละเอียดบิล')).toBeNull());
});

test('bill screen can link the selected customer to a LINE user', async () => {
  const mockApiPost = jest.requireMock('../src/api').api.post as jest.Mock;
  mockApiPost.mockClear();
  await renderWithQuery(<BillsScreen />);
  await fireEvent.press(await screen.findByText('LINE-FA1C237B'));
  expect(await screen.findByText('ผูกกับ LINE user ก่อนสร้างบิล')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Uxxxxxxxx'), ' U456 ');
  await waitFor(() => expect(screen.getByPlaceholderText('Uxxxxxxxx').props.value).toBe(' U456 '));
  fireEvent(screen.getByRole('button', { name: 'ผูก LINE' }), 'click');
  await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/customers/link-line', { customer_code: 'LINE-FA1C237B', line_user_id: 'U456' }));
});

test('platform screen and coming-soon preserve the themed content contract', async () => {
  await renderWithQuery(<PlatformScreen />);
  expect(screen.getByText('เลือกองค์กร')).toBeTruthy();
  expect(await screen.findByText('เข้าสู่มุมมองขององค์กร')).toBeTruthy();
  await cleanup();

  await renderWithQuery(<ComingSoonScreen navigation={{} as never} route={{ params: { title: 'รายงาน', description: 'กำลังเตรียมข้อมูล' } } as never} />);
  expect(screen.getByText('รายงาน')).toBeTruthy();
  expect(screen.getByText('กำลังเตรียมข้อมูล')).toBeTruthy();
});

test('chatclone keeps the web conversation search and snake_case data contract', async () => {
  await renderWithQuery(<ChatCloneScreen />);
  expect(screen.getByText('Chatclone')).toBeTruthy();
  expect(screen.getByPlaceholderText('ค้นหาชื่อ / LINE ID / ข้อความ')).toBeTruthy();
  expect(await screen.findByText('คุณสมชาย')).toBeTruthy();
  expect(screen.getByText('ลูกค้า: สอบถามยอดค้างชำระ')).toBeTruthy();
  expect(screen.getByText('1 สนทนา')).toBeTruthy();
});

test('chatclone mobile opens a LINE-style detail view and returns to the chat list', async () => {
  await renderWithQuery(<ChatCloneScreen />);
  fireEvent.press(await screen.findByText('คุณสมชาย'));
  expect(await screen.findByLabelText('กลับไปยังรายการสนทนา')).toBeTruthy();
  expect(await screen.findByText('ข้อความทดสอบ')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('กลับไปยังรายการสนทนา'));
  await waitFor(() => expect(screen.queryByLabelText('กลับไปยังรายการสนทนา')).toBeNull());
  expect(screen.getByPlaceholderText('ค้นหาชื่อ / LINE ID / ข้อความ')).toBeTruthy();
  cleanup();
});
