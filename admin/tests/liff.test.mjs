import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// These modules have no runtime imports. Compile the real production TypeScript
// with the project's existing compiler; no browser, LINE account or DB required.
async function loadModule(name) {
  const source = await readFile(new URL(`../src/liff/${name}.ts`, import.meta.url), 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return '';
    throw e;
  });
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const model = await loadModule('model');
const session = await loadModule('session');
const installment = (values = {}) => ({
  id: 'i1', installment_no: 1, due_date: '2026-09-15',
  amount_due: 1000, amount_paid: 0, status: 'pending',
  bill_plan: { bill_no: 12 }, ...values,
});

// Regression: paid/cancelled rows must never be offered as unpaid installments.
test('unpaid tab excludes paid, cancelled and fully allocated rows', () => {
  assert.equal(typeof model.unpaidInstallments, 'function');
  const rows = [installment(), installment({ id: 'paid', status: 'paid' }),
    installment({ id: 'cancelled', status: 'cancelled' }),
    installment({ id: 'allocated', amount_paid: 1000 }),
    installment({ id: 'partial', status: 'partial_paid', amount_paid: 250 })];
  assert.deepEqual(model.unpaidInstallments(rows).map((i) => i.id), ['i1', 'partial']);
});
test('unpaid rows are ordered by due date across bills without mutating input', () => {
  assert.equal(typeof model.unpaidInstallments, 'function');
  const rows = [installment({ id: 'later', bill_plan: { bill_no: 1 } }),
    installment({ id: 'earlier', due_date: '2026-09-08', bill_plan: { bill_no: 99 } })];
  assert.equal(model.unpaidInstallments(rows)[0].id, 'earlier');
  assert.equal(rows[0].id, 'later');
});
test('remaining balance is rounded to satang and cannot be negative', () => {
  assert.equal(typeof model.remainingAmount, 'function');
  assert.equal(model.remainingAmount(installment({ amount_due: 0.3, amount_paid: 0.1 })), 0.2);
  assert.equal(model.remainingAmount(installment({ amount_paid: 1100 })), 0);
});
test('amounts always render two decimal places', () => {
  assert.equal(typeof model.formatAmount, 'function');
  assert.equal(model.formatAmount(12500), '12,500.00');
});
test('date-only due dates do not shift with device timezone', () => {
  assert.equal(typeof model.formatDate, 'function');
  assert.equal(model.formatDate('2026-09-08'), model.formatDate('2026-09-08T00:00:00.000Z'));
  assert.ok(model.formatDate('2026-09-08').includes('2569'));
  assert.equal(model.formatDate(null), '\u2014');
});
test('unknown and cancelled statuses have explicit neutral text', () => {
  assert.equal(typeof model.installmentStatus, 'function');
  assert.equal(model.installmentStatus('cancelled').tone, 'neutral');
  assert.equal(model.installmentStatus('unexpected').tone, 'neutral');
  assert.ok(model.installmentStatus('unexpected').label.length > 0);
});
test('OA is read from the final query or the SDK state without modifying it', () => {
  assert.equal(typeof session.readOaId, 'function');
  assert.equal(session.readOaId('?oa=oa-one&view=bill'), 'oa-one');
  assert.equal(session.readOaId('?liff.state=%3Fview%3Dbill%26oa%3Doa-two'), 'oa-two');
  assert.equal(session.readOaId('?oa=oa-one&liff.state=%3Foa%3Doa-two'), 'oa-one');
  assert.equal(session.readOaId('?view=bill'), null);
});

function fixture() {
  const trace = [];
  const controller = new AbortController();
  const data = { customer: { customer_code: 'C001', display_name: 'Test customer' },
    balance: { outstanding: 350, count: 1, next_due_date: '2026-09-15' },
    installments: [installment()], payments: [] };
  const sdk = { init: async () => { trace.push('init'); }, isLoggedIn: () => true,
    isInClient: () => true, login: () => { trace.push('login'); }, getIDToken: () => 'line-id-token',
    closeWindow: () => {} };
  const api = { clearToken: () => trace.push('clear'),
    setToken: (token) => trace.push(`token:${token}`),
    createSession: async (id, oa, signal) => {
      trace.push(`session:${id}:${oa}`); assert.equal(signal, controller.signal);
      return { token: 'verified-session', customer: data.customer };
    },
    getBalance: async () => data.balance,
    getInstallments: async () => data.installments,
    getPayments: async () => data.payments,
  };
  const options = { sdk, liffId: 'test-liff', getSearch: () => '?oa=oa-one', api, signal: controller.signal };
  return { trace, controller, data, sdk, api, options };
}
test('bootstrap re-verifies identity before fetching customer data (no cached-user reuse)', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture();
  const data = await session.loadCustomerData(f.options);
  assert.deepEqual(data, f.data);
  assert.deepEqual(f.trace, ['clear', 'init', 'session:line-id-token:oa-one', 'token:verified-session']);
});
test('OA parameters are resolved after LIFF initialization', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture(); let query = '';
  f.options.getSearch = () => query;
  f.sdk.init = async () => { query = '?oa=oa-after-init'; };
  await session.loadCustomerData(f.options);
  assert.ok(f.trace.includes('session:line-id-token:oa-after-init'));
});
test('external browser login redirects before any customer API is requested', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture(); f.sdk.isLoggedIn = () => false; f.sdk.isInClient = () => false;
  assert.equal(await session.loadCustomerData(f.options), null);
  assert.deepEqual(f.trace, ['clear', 'init', 'login']);
});
test('missing configuration does not call LINE or customer APIs', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture(); f.options.liffId = '';
  await assert.rejects(session.loadCustomerData(f.options), { kind: 'not_configured' });
  assert.deepEqual(f.trace, ['clear']);
});
test('missing SDK has a distinct recoverable state', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture(); f.options.sdk = undefined;
  await assert.rejects(session.loadCustomerData(f.options), { kind: 'sdk_unavailable' });
});
test('unlinked account never loads financial data', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture(); let reads = 0;
  f.api.createSession = async () => { throw { code: 'NOT_FOUND' }; };
  f.api.getBalance = async () => { reads++; return f.data.balance; };
  await assert.rejects(session.loadCustomerData(f.options), { kind: 'not_linked' });
  assert.equal(reads, 0);
});
test('null ID token does not request a server session', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture(); f.sdk.getIDToken = () => null;
  await assert.rejects(session.loadCustomerData(f.options), { kind: 'unauthorized' });
  assert.deepEqual(f.trace, ['clear', 'init']);
});
test('aborted bootstrap cannot store a stale token or start financial reads', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture();
  f.api.createSession = async () => { f.controller.abort(); return { token: 'stale', customer: f.data.customer }; };
  await assert.rejects(session.loadCustomerData(f.options), { name: 'AbortError' });
  assert.ok(!f.trace.some((value) => value.startsWith('token:')));
});
test('a rejected financial request never becomes an empty paid-off dashboard', async () => {
  assert.equal(typeof session.loadCustomerData, 'function');
  const f = fixture();
  f.api.getBalance = async () => { throw new Error('network unavailable'); };
  await assert.rejects(session.loadCustomerData(f.options), /network unavailable/);
});

const apiSource = (await readFile(new URL('../src/liff/api.ts', import.meta.url), 'utf8'))
  .replaceAll('import.meta.env', '({ VITE_API_BASE: "" })');
const apiJs = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const client = await import(`data:text/javascript;base64,${Buffer.from(apiJs).toString('base64')}`);

function installStorage(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value });
  t.after(() => {
    client.clearLiffToken();
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else delete globalThis.sessionStorage;
  });
}

test('private API requests use no-store and forward the abort signal', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.headers.authorization, 'Bearer verified');
    return new Response(JSON.stringify({ success: true, data: { outstanding: 12500 } }));
  });
  const storage = new Map();
  installStorage(t, { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) });
  const controller = new AbortController();
  client.setLiffToken('verified');
  assert.deepEqual(await client.liffGet('/api/liff/me/balance', controller.signal), { outstanding: 12500 });
});
test('HTTP errors cannot be hidden by a success-shaped response body', async (t) => {
  installStorage(t, { getItem: () => '', removeItem: () => {} });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 503 }));
  await assert.rejects(client.liffGet('/api/liff/me/installments'), { status: 503 });
});
test('blocked sessionStorage falls back to a page-only token, and clears it safely', (t) => {
  installStorage(t, undefined);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  try {
    assert.doesNotThrow(() => client.setLiffToken('page-only'));
    assert.equal(client.getLiffToken(), 'page-only');
    assert.doesNotThrow(() => client.clearLiffToken());
    assert.equal(client.getLiffToken(), '');
  } finally { client.clearLiffToken(); }
});
