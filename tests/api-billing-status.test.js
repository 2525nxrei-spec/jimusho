/**
 * functions/api/billing/status.js のテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet } from '../functions/api/billing/status.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('GET /api/billing/status', () => {
  const JWT_SECRET = 'test-jwt-secret';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createContext(dbOverrides = {}, envOverrides = {}, authenticated = true) {
    const headers = {};
    if (authenticated) {
      const token = await createJWT(
        { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET
      );
      headers['Authorization'] = `Bearer ${token}`;
    }
    const request = new Request('https://jimusho-tool.com/api/billing/status', {
      headers: new Headers(headers),
    });
    const db = createMockDB(dbOverrides);
    return {
      request,
      env: { JWT_SECRET, DB: db, STRIPE_SECRET_KEY: 'sk_test_dummy', ...envOverrides },
    };
  }

  it('未認証の場合は401を返す', async () => {
    const ctx = await createContext({}, {}, false);
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(401);
  });

  it('freeプランのユーザーはsubscriptionなしでステータスを返す', async () => {
    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'free', stripe_customer_id: null, stripe_subscription_id: null,
      },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.plan).toBe('free');
    expect(json.subscription).toBeNull();
  });

  it('proプランのユーザーはサブスクリプション情報を返す', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 30;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        id: 'sub_test', status: 'active',
        current_period_end: periodEnd, cancel_at_period_end: false,
      }),
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'pro', stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_test',
      },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.plan).toBe('pro');
    expect(json.subscription).not.toBeNull();
    expect(json.subscription.id).toBe('sub_test');
    expect(json.subscription.status).toBe('active');
    expect(json.subscription.cancel_at_period_end).toBe(false);
  });

  it('Stripe APIエラー時もplanは返す（subscriptionはnull）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: 'API error' } }),
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'pro', stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_broken',
      },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toBe('pro');
    expect(json.subscription).toBeNull();
  });
});
