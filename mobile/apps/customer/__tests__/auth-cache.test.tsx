import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pressable, Text } from 'react-native';
import { CustomerAuthProvider, useCustomerAuth } from '../src/auth';

const mockStoreValues = new Map([['oa_id', 'oa-1']]);

jest.mock('../src/api', () => ({ api: {
  getToken: jest.fn(async () => null),
  get: jest.fn(async () => ({ customer_code: 'CUS-1', display_name: 'Customer' })),
  setToken: jest.fn(async () => {}),
  clearToken: jest.fn(async () => {}),
  post: jest.fn(async () => ({ token: 'token', customer: { customer_code: 'CUS-1', display_name: 'Customer' } })),
} }));
jest.mock('../src/storage', () => ({ store: {
  get: jest.fn(async (key: string) => mockStoreValues.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => { mockStoreValues.set(key, value); }),
  remove: jest.fn(async (key: string) => { mockStoreValues.delete(key); }),
} }));
jest.mock('@xmartlabs/react-native-line', () => ({ __esModule: true, default: { setup: jest.fn(), login: jest.fn() }, Scope: { Profile: 'profile', OpenId: 'openid' } }));

const mockApi = jest.requireMock('../src/api').api as { getToken: jest.Mock; get: jest.Mock; setToken: jest.Mock; clearToken: jest.Mock; post: jest.Mock };

function Probe() {
  const auth = useCustomerAuth();
  return <><Text testID="stage">{auth.stage}</Text><Pressable testID="login" onPress={() => void auth.loginWithLine().catch(() => {})}><Text>login</Text></Pressable><Pressable testID="logout" onPress={() => void auth.logout()}><Text>logout</Text></Pressable><Pressable testID="switch-oa" onPress={() => void auth.setOaFromLink('billcustomer://open?oa=oa-2')}><Text>switch OA</Text></Pressable></>;
}

function renderAuth(queryClient: QueryClient) {
  return render(<QueryClientProvider client={queryClient}><CustomerAuthProvider><Probe /></CustomerAuthProvider></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getToken.mockResolvedValue(null);
  mockApi.get.mockResolvedValue({ customer_code: 'CUS-1', display_name: 'Customer' });
  mockStoreValues.set('oa_id', 'oa-1');
});

test('clears cached customer data before logout', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['customer-balance', 'oa-1', 'CUS-1'], { outstanding: 999 });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('stage').props.children).toBe('needs_login'));

  await fireEvent.press(screen.getByTestId('logout'));
  await waitFor(() => expect(queryClient.getQueryData(['customer-balance', 'oa-1', 'CUS-1'])).toBeUndefined());
  expect(mockApi.clearToken).toHaveBeenCalledTimes(1);
});

test('clears cached customer data before switching OA', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['customer-balance', 'oa-1', 'CUS-1'], { outstanding: 999 });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('stage').props.children).toBe('needs_login'));

  await fireEvent.press(screen.getByTestId('switch-oa'));
  await waitFor(() => expect(queryClient.getQueryData(['customer-balance', 'oa-1', 'CUS-1'])).toBeUndefined());
});

test('clears cached customer data before starting a new login', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const oldKey = ['customer-balance', 'oa-1', 'CUS-1'];
  queryClient.setQueryData(oldKey, { outstanding: 999 });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('stage').props.children).toBe('needs_login'));

  await fireEvent.press(screen.getByTestId('login'));
  await waitFor(() => expect(screen.getByTestId('stage').props.children).toBe('error'));
  expect(queryClient.getQueryData(oldKey)).toBeUndefined();
});

test('clears cached customer data when the auth session fails to refresh', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['customer-balance', 'oa-1', 'CUS-1'], { outstanding: 999 });
  mockApi.getToken.mockResolvedValue('token');
  mockApi.get.mockRejectedValue(new Error('expired session'));
  renderAuth(queryClient);

  await waitFor(() => expect(screen.getByTestId('stage').props.children).toBe('needs_login'));
  expect(queryClient.getQueryData(['customer-balance', 'oa-1', 'CUS-1'])).toBeUndefined();
  expect(mockApi.clearToken).toHaveBeenCalledTimes(1);
});
