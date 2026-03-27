/**
 * Stripe Customer Portal 異常系テスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/portal.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('POST /api/stripe/portal — 異常系', () => {
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
    const request = new Request('https://jimusho-tool.com/api/stripe/portal', {
      method: 'POST',
      headers: new Headers(headers),
    });
    const db = createMockDB(dbOverrides);
    return {
      request,
      env: { JWT_SECRET, DB: db, STRIPE_SECRET_KEY: 'sk_test_dummy', FRONTEND_URL: 'https://jimusho-tool.com', ...envOverrides },
    };
  }

  it('Stripe APIがエラーを返す場合は500を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: 'Customer not found' } }),
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'pro',
        stripe_customer_id: 'cus_invalid', stripe_subscription_id: 'sub_123',
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('ポータルの作成に失敗');
  });

  it('期限切れトークンで401を返す', async () => {
    const expiredToken = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 100 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/stripe/portal', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expiredToken}`,
      }),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB(), STRIPE_SECRET_KEY: 'sk_test_dummy' } };
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it('fetchがネットワークエラーを投げる場合は500を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'pro',
        stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_123',
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('FRONTEND_URLが未設定でもデフォルトURLが使われる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://billing.stripe.com/session/test' }),
    }));

    const ctx = await createContext(
      {
        _firstResult: {
          id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'pro',
          stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_123',
        },
      },
      { FRONTEND_URL: undefined }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    // fetchに渡されたbodyにjimusho-tool.comが含まれているか確認
    const fetchCall = fetch.mock.calls[0];
    expect(fetchCall[1].body).toContain('jimusho-tool.com');
  });
});
