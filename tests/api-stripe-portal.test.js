/**
 * functions/api/stripe/portal.js のテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/portal.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('POST /api/stripe/portal', () => {
  const JWT_SECRET = 'test-jwt-secret';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createContext(dbOverrides = {}, authenticated = true) {
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
      env: { JWT_SECRET, DB: db, STRIPE_SECRET_KEY: 'sk_test_dummy', FRONTEND_URL: 'https://jimusho-tool.com' },
    };
  }

  it('未認証の場合は401を返す', async () => {
    const ctx = await createContext({}, false);
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it('stripe_customer_idがない場合は400を返す', async () => {
    const ctx = await createContext({
      _firstResult: { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free', stripe_customer_id: null, stripe_subscription_id: null },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('サブスクリプション情報');
  });

  it('正常にポータルURLを返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://billing.stripe.com/session/test_portal' }),
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'pro',
        stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_123',
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.portal_url).toContain('stripe.com');
  });
});
