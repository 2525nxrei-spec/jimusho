/**
 * Checkout API高度なテスト — 全フロー・パラメータ検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/checkout.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

const JWT_SECRET = 'test-jwt-secret';

async function createAuthenticatedContext(userOverrides = {}, envOverrides = {}, dbOverrides = {}) {
  const user = {
    id: 'user-1',
    email: 'test@example.com',
    display_name: 'Test User',
    plan: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...userOverrides,
  };
  const token = await createJWT(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );
  const request = new Request('https://jimusho-tool.com/api/stripe/checkout', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }),
  });
  const db = createMockDB({
    _firstHandler: (sql) => {
      if (sql.includes('SELECT id, email')) return user;
      return null;
    },
    ...dbOverrides,
  });
  return {
    request,
    env: {
      JWT_SECRET,
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_PRICE_PRO: 'price_test_123',
      FRONTEND_URL: 'https://jimusho-tool.com',
      DB: db,
      ...envOverrides,
    },
  };
}

describe('POST /api/stripe/checkout — STRIPE_PRICE_PRO未設定', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('STRIPE_PRICE_PROが空文字の場合は500を返す', async () => {
    const ctx = await createAuthenticatedContext({}, { STRIPE_PRICE_PRO: '' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Price ID');
  });

  it('STRIPE_PRICE_PROがundefinedの場合は500を返す', async () => {
    const ctx = await createAuthenticatedContext({}, { STRIPE_PRICE_PRO: undefined });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/stripe/checkout — 既存顧客フロー', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('既にstripe_customer_idがある場合は顧客作成をスキップする', async () => {
    const fetchCalls = [];
    globalThis.fetch = vi.fn(async (url, opts) => {
      fetchCalls.push({ url: url.toString(), method: opts?.method });
      return new Response(JSON.stringify({ id: 'cs_test', client_secret: 'cs_secret_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const ctx = await createAuthenticatedContext({ stripe_customer_id: 'cus_existing' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    // customersエンドポイントへのPOSTがないことを確認
    const customerCreate = fetchCalls.find(c => c.url.includes('/customers') && c.method === 'POST');
    expect(customerCreate).toBeUndefined();

    // checkout/sessionsへのPOSTがあることを確認
    const sessionCreate = fetchCalls.find(c => c.url.includes('checkout/sessions'));
    expect(sessionCreate).toBeDefined();
  });

  it('新規顧客の場合はまずcustomersを作成してからcheckout/sessionsを作成する', async () => {
    const fetchCalls = [];
    globalThis.fetch = vi.fn(async (url) => {
      fetchCalls.push(url.toString());
      if (url.toString().includes('/customers')) {
        return new Response(JSON.stringify({ id: 'cus_new_created' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 'cs_test', client_secret: 'cs_secret_new' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const runCalls = [];
    const ctx = await createAuthenticatedContext(
      { stripe_customer_id: null },
      {},
      {
        _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
      }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clientSecret).toBe('cs_secret_new');

    // customers → checkout/sessionsの順にfetchされる
    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0]).toContain('/customers');
    expect(fetchCalls[1]).toContain('checkout/sessions');

    // DB更新でstripe_customer_idが保存される
    const dbUpdate = runCalls.find(c => c.sql.includes('stripe_customer_id'));
    expect(dbUpdate).toBeDefined();
  });
});

describe('POST /api/stripe/checkout — display_nameフォールバック', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('display_nameがnullの場合はemailがStripe顧客名に使われる', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url.toString().includes('/customers')) {
        capturedBody = opts?.body || '';
        return new Response(JSON.stringify({ id: 'cus_no_name' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 'cs_test', client_secret: 'cs_secret' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const ctx = await createAuthenticatedContext({ display_name: null, stripe_customer_id: null });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    // nameパラメータにemailが使われていることを確認
    expect(capturedBody).toContain('test%40example.com');
  });
});

describe('POST /api/stripe/checkout — FRONTEND_URLフォールバック', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('FRONTEND_URLが未設定でもデフォルトURLが使われる', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url.toString().includes('checkout/sessions')) {
        capturedBody = opts?.body || '';
      }
      return new Response(JSON.stringify({ id: 'cs_test', client_secret: 'cs_secret' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const ctx = await createAuthenticatedContext(
      { stripe_customer_id: 'cus_existing' },
      { FRONTEND_URL: '' }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    expect(capturedBody).toContain('jimusho-tool.com');
  });
});

describe('POST /api/stripe/checkout — DB更新失敗', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('顧客作成後のDB更新失敗で500を返す', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.toString().includes('/customers')) {
        return new Response(JSON.stringify({ id: 'cus_new' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 'cs_test', client_secret: 'cs_secret' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const ctx = await createAuthenticatedContext(
      { stripe_customer_id: null },
      {},
      {
        _runHandler: () => { throw new Error('D1 connection lost'); },
      }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('決済セッション');
  });
});
