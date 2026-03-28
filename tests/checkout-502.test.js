/**
 * Stripe Checkout 502防止テスト
 * - STRIPE_SECRET_KEY未設定時に500 JSONが返ることをテスト
 * - STRIPE_PRICE_PRO未設定時に500 JSONが返ることをテスト
 * - DB未バインド時に500 JSONが返ることをテスト
 * - 全エラーレスポンスがJSON形式であることをテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/checkout.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('Stripe Checkout — 502防止・環境変数バリデーション', () => {
  const JWT_SECRET = 'test-jwt-secret-key-for-testing';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createAuthContext(envOverrides = {}, dbOverrides = {}) {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
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
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'テスト',
        plan: 'free', stripe_customer_id: 'cus_123', stripe_subscription_id: null,
      },
      ...dbOverrides,
    });
    return {
      request,
      env: {
        JWT_SECRET,
        DB: db,
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_PRICE_PRO: 'price_test_dummy',
        FRONTEND_URL: 'https://jimusho-tool.com',
        ...envOverrides,
      },
    };
  }

  it('STRIPE_SECRET_KEYが未設定時に500 JSONエラーを返す（502にならない）', async () => {
    const ctx = await createAuthContext({ STRIPE_SECRET_KEY: '' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('決済サービスの設定');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('STRIPE_SECRET_KEYがundefined時に500 JSONエラーを返す', async () => {
    const ctx = await createAuthContext({ STRIPE_SECRET_KEY: undefined });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('STRIPE_PRICE_PROが未設定時に500 JSONエラーを返す', async () => {
    const ctx = await createAuthContext({ STRIPE_PRICE_PRO: '' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('Price ID');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('DBが未バインド（null）時にクラッシュせず401を返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
    });
    const ctx = {
      request,
      env: {
        JWT_SECRET,
        DB: null,
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_PRICE_PRO: 'price_test_dummy',
      },
    };
    // DB nullでもクラッシュせず、authenticateUserがnullを返し401になる
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('正常なStripeレスポンス時に200+clientSecretを返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'cs_test_123', client_secret: 'cs_secret_xxx' }),
    }));

    const ctx = await createAuthContext();
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.clientSecret).toBe('cs_secret_xxx');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('未認証リクエスト時に401 JSONを返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });
    const ctx = {
      request,
      env: {
        JWT_SECRET,
        DB: createMockDB(),
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_PRICE_PRO: 'price_test_dummy',
      },
    };
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
