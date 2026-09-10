import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pressable, Text } from 'react-native';
import { AdminAuthProvider, useAdminAuth } from '../src/auth';

const mockStoreValues = new Map([['org_id', 'org-1'], ['org_name', 'Org 1']]);

jest.mock('../src/api', () => ({ api: {
  getToken: jest.fn(async () => 'token'),
  get: jest.fn(async () => ({ user_id: 'admin-1', name: 'Admin', is_platform_admin: false, org: { id: 'org-1', name: 'Org 1' } })),
  setToken: jest.fn(async () => {}),
  clearToken: jest.fn(async () => {}),
  post: jest.fn(async () => ({ token: 'token' })),
} }));
jest.mock('../src/storage', () => ({ store: {
  get: jest.fn(async (key: string) => mockStoreValues.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => { mockStoreValues.set(key, value); }),
  remove: jest.fn(async (key: string) => { mockStoreValues.delete(key); }),
} }));
jest.mock('@xmartlabs/react-native-line', () => ({ __esModule: true, default: { setup: jest.fn(), login: jest.fn() }, Scope: { Profile: 'profile', OpenId: 'openid' } }));

const mockApi = jest.requireMock('../src/api').api as { getToken: jest.Mock; get: jest.Mock; setToken: jest.Mock; clearToken: jest.Mock; post: jest.Mock };

function Probe() {
  const auth = useAdminAuth();
  return <><Text testID="status">{auth.status}</Text><Pressable testID="login" onPress={() => void auth.login('admin', 'password').catch(() => undefined)}><Text>login</Text></Pressable><Pressable testID="logout" onPress={() => void auth.logout()}><Text>logout</Text></Pressable><Pressable testID="switch-org" onPress={() => void auth.enterOrg({ id: 'org-2', name: 'Org 2' })}><Text>switch org</Text></Pressable></>;
}

function renderAuth(queryClient: QueryClient) {
  return render(<QueryClientProvider client={queryClient}><AdminAuthProvider><Probe /></AdminAuthProvider></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getToken.mockResolvedValue('token');
  mockApi.get.mockResolvedValue({ user_id: 'admin-1', name: 'Admin', is_platform_admin: false, org: { id: 'org-1', name: 'Org 1' } });
  mockStoreValues.set('org_id', 'org-1');
  mockStoreValues.set('org_name', 'Org 1');
});

test('clears cached admin data before logout', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['mobile-customers', 'admin-1', 'org-1'], { items: [{ id: 'secret' }] });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_in'));

  await fireEvent.press(screen.getByTestId('logout'));
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_out'));
  expect(queryClient.getQueryData(['mobile-customers', 'admin-1', 'org-1'])).toBeUndefined();
  expect(mockApi.clearToken).toHaveBeenCalledTimes(1);
});

test('clears cached admin data before switching organizations', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['mobile-customers', 'admin-1', 'org-1'], { items: [{ id: 'secret' }] });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_in'));

  await fireEvent.press(screen.getByTestId('switch-org'));
  await waitFor(() => expect(queryClient.getQueryData(['mobile-customers', 'admin-1', 'org-1'])).toBeUndefined());
});

test('clears cached admin data before starting a new login', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const oldKey = ['mobile-customers', 'admin-1', 'org-1'];
  queryClient.setQueryData(oldKey, { items: [{ id: 'secret' }] });
  mockApi.post.mockImplementationOnce(async () => {
    expect(queryClient.getQueryData(oldKey)).toBeUndefined();
    return { token: 'token' };
  });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_in'));

  await fireEvent.press(screen.getByTestId('login'));
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_in'));
  expect(queryClient.getQueryData(oldKey)).toBeUndefined();
});

test('clears cached admin data when the auth session fails to refresh', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['mobile-customers', 'admin-1', 'org-1'], { items: [{ id: 'secret' }] });
  mockApi.get.mockRejectedValue(new Error('expired session'));
  renderAuth(queryClient);

  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_out'));
  expect(queryClient.getQueryData(['mobile-customers', 'admin-1', 'org-1'])).toBeUndefined();
  expect(mockApi.clearToken).toHaveBeenCalledTimes(1);
});

test('clears cached admin data and returns to signed out after replacement login fails', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  queryClient.setQueryData(['mobile-customers', 'admin-1', 'org-1'], { items: [{ id: 'secret' }] });
  renderAuth(queryClient);
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_in'));

  mockApi.post.mockRejectedValueOnce(new Error('bad credentials'));
  await fireEvent.press(screen.getByTestId('login'));
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signed_out'));
  expect(queryClient.getQueryData(['mobile-customers', 'admin-1', 'org-1'])).toBeUndefined();
});
