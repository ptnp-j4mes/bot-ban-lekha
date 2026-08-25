/**
 * @format
 */

import { parseCustomerOaId } from '../../../shared/src/deepLink';
import { formatBaht } from '../../../shared/src/format';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerHomeScreen } from '../src/screens/CustomerHomeScreen';
import { PaymentsScreen } from '../src/screens/PaymentsScreen';

const mockCustomerApiGet = jest.fn(async (path: string) => {
  if (path.includes('/balance')) return { outstanding: 490, count: 1, next_due_date: '2026-08-30' };
  if (path.includes('/installments')) return [{ id: 'i1', installment_no: 1, due_date: '2026-08-30', amount_due: 490, amount_paid: 0, status: 'pending', bill_plan: { bill_no: 11 } }];
  return [{ id: 'p1', amount: 490, approved_at: '2026-08-20', payment_method: 'โอนเงิน', bill_installment: { installment_no: 1, bill_plan: { bill_no: 11 } } }];
});

jest.mock('../src/auth', () => ({
  useCustomerAuth: () => ({ displayName: 'คุณทดสอบ', logout: jest.fn(async () => {}) }),
}));
jest.mock('../src/api', () => ({ api: { get: mockCustomerApiGet } }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

test('parses customer OA deep links without trusting other query fields', () => {
  expect(parseCustomerOaId('billcustomer://open?oa=oa-123&token=ignored')).toBe('oa-123');
  expect(parseCustomerOaId('billcustomer://open?token=ignored')).toBeNull();
});

test('formats customer balance in baht', () => expect(formatBaht(490)).toContain('490'));

test('renders customer balance and next installment', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
  client.setQueryData(['customer-balance'], { outstanding: 490, count: 1, next_due_date: '2026-08-30' });
  client.setQueryData(['customer-installments'], [{ id: 'i1', installment_no: 1, due_date: '2026-08-30', amount_due: 490, amount_paid: 0, status: 'pending', bill_plan: { bill_no: 11 } }]);
  await render(<QueryClientProvider client={client}><CustomerHomeScreen /></QueryClientProvider>);
  expect(screen.getByText('ยอดคงเหลือ')).toBeTruthy();
  expect(await screen.findByText('มีงวดค้างชำระ 1 งวด')).toBeTruthy();
  expect(await screen.findByText(/บิล 11/)).toBeTruthy();
});

test('renders customer payment history', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
  client.setQueryData(['customer-payments'], [{ id: 'p1', amount: 490, approved_at: '2026-08-20', payment_method: 'โอนเงิน', bill_installment: { installment_no: 1, bill_plan: { bill_no: 11 } } }]);
  await render(<QueryClientProvider client={client}><PaymentsScreen /></QueryClientProvider>);
  expect(await screen.findByText(/บิล 11/)).toBeTruthy();
  expect(screen.getByText(/โอนเงิน/)).toBeTruthy();
});
