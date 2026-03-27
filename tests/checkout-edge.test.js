/**
 * Stripe Checkout異常系テスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/checkout.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('POST /api/stripe/checkout — 異常系', () => {
  const JWT_SECRET = 'test-jwt-secret';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createContext(dbOverrides = {}, envOverrides = {}, authenticated = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) {
      const token = await createJWT(
        { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET
      );
      headers['Authorization'] = `Bearer ${token}`;
    }
    const request = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'POST',
      headers: new Headers(headers),
    });
    const db = createMockDB(dbOverrides);
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

  it('Stripe APIがエラーを返す場合は500を返す（顧客作成時）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'free', stripe_customer_id: null, stripe_subscription_id: null,
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('決済セッションの作成に失敗');
  });

  it('Stripe APIがエラーを返す場合は500を返す（セッション作成時）', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ json: () => Promise.resolve({ id: 'cus_new' }) });
      }
      // 2回目でエラー
      return Promise.resolve({ json: () => Promise.resolve({ error: { message: 'Invalid price' } }) });
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'free', stripe_customer_id: null, stripe_subscription_id: null,
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('STRIPE_SECRET_KEYが未設定でもAPIコール時にエラーになり500を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
    }));

    const ctx = await createContext(
      {
        _firstResult: {
          id: 'user-1', email: 'test@example.com', display_name: 'T',
          plan: 'free', stripe_customer_id: 'cus_123', stripe_subscription_id: null,
        },
      },
      { STRIPE_SECRET_KEY: '' }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('期限切れトークンで401を返す', async () => {
    const expiredToken = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 100 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expiredToken}`,
      }),
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
  });

  it('fetchがネットワークエラーを投げる場合は500を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'free', stripe_customer_id: 'cus_123', stripe_subscription_id: null,
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});
