import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '../../../shared/src/ui';
import { AdminMenuProvider } from '../src/components/AdminMenu';

jest.mock('../src/api', () => ({
  api: {
    get: jest.fn(async (path: string) => path.includes('payment-submissions') ? { total: 3 } : []),
  },
}));

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const navigationRef = {
  isReady: () => true,
  navigate: mockNavigate,
  getCurrentRoute: () => ({ name: 'Dashboard' }),
} as never;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useNavigationState: () => 'Dashboard',
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function renderMenu(mode: 'org' | 'platform' = 'org') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><AdminMenuProvider mode={mode} profileLabel="Admin User" onLogout={mockLogout} navigationRef={navigationRef}><Header eyebrow="ทดสอบ" title="ภาพรวม" /></AdminMenuProvider></QueryClientProvider>);
}

test('opens the responsive admin menu and navigates to an existing screen', async () => {
  await renderMenu();
  await fireEvent.press(screen.getByLabelText('เปิดเมนู'));
  expect(screen.getByText('จัดการ')).toBeTruthy();
  expect(screen.getByText('รายงาน')).toBeTruthy();
  expect(screen.getByText('Chatclone')).toBeTruthy();
  await fireEvent.press(screen.getByText('ลูกค้า'));
  expect(mockNavigate).toHaveBeenCalledWith('Customers');
});

test('renders the floating menu island and routes from its quick tabs', async () => {
  await renderMenu();
  expect(screen.getByLabelText('เมนู island')).toBeTruthy();
  expect(screen.getByLabelText('เมนู island: ภาพรวม')).toBeTruthy();
  expect(screen.getByLabelText('เมนู island: แชท')).toBeTruthy();
  expect(screen.getByLabelText('เมนู island: เมนูทั้งหมด')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('เมนู island: ลูกค้า'));
  expect(mockNavigate).toHaveBeenCalledWith('Customers');
});

test('shows platform menu sections and logs out from the sheet', async () => {
  await renderMenu('platform');
  await fireEvent.press(screen.getByLabelText('เปิดเมนู'));
  expect(screen.getByText('ผู้ใช้ & องค์กร')).toBeTruthy();
  await fireEvent.press(screen.getByText('ออกจากระบบ'));
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test('shows notification badge and navigates from the notification sheet', async () => {
  await renderMenu();
  expect((await screen.findAllByText('3')).length).toBeGreaterThanOrEqual(1);
  await fireEvent.press(screen.getByLabelText('การแจ้งเตือน'));
  expect(screen.getByText('การแจ้งเตือน')).toBeTruthy();
  expect(screen.getByText('สลิปรอตรวจสอบ')).toBeTruthy();
  await fireEvent.press(screen.getByText('สลิปรอตรวจสอบ'));
  expect(mockNavigate).toHaveBeenCalledWith('Submissions');
});
