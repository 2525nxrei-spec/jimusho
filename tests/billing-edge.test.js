/**
 * billing/status の追加エッジケーステスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet } from '../functions/api/billing/status.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('GET /api/billing/status — 追加テスト', () => {
  const JWT_SECRET = 'test-jwt-secret';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createAuthContext(dbOverrides = {}, envOverrides = {}) {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/billing/status', {
      headers: new Headers({ 'Authorization': `Bearer ${token}` }),
    });
    const db = createMockDB(dbOverrides);
    return {
      request,
      env: { JWT_SECRET, DB: db, STRIPE_SECRET_KEY: 'sk_test_dummy', ...envOverrides },
    };
  }

  it('planがnull/undefinedの場合はfreeとして返す', async () => {
    const ctx = await createAuthContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: null, stripe_customer_id: null, stripe_subscription_id: null,
      },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toBe('free');
  });

  it('STRIPE_SECRET_KEYが未設定の場合はサブスク情報を取得しない', async () => {
    const ctx = await createAuthContext(
      {
        _firstResult: {
          id: 'user-1', email: 'test@example.com', display_name: 'T',
          plan: 'pro', stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_123',
        },
      },
      { STRIPE_SECRET_KEY: '' }
    );
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toBe('pro');
    expect(json.subscription).toBeNull();
  });

  it('cancel_at_period_endがtrueの場合も正しく返す', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 15;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        id: 'sub_canceling', status: 'active',
        current_period_end: periodEnd, cancel_at_period_end: true,
      }),
    }));

    const ctx = await createAuthContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'pro', stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_canceling',
      },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subscription.cancel_at_period_end).toBe(true);
    expect(json.subscription.next_billing_date).toBeTruthy();
  });

  it('current_period_endがnullの場合はnext_billing_dateがnull', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        id: 'sub_no_period', status: 'trialing',
        current_period_end: null, cancel_at_period_end: false,
      }),
    }));

    const ctx = await createAuthContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'pro', stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_no_period',
      },
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subscription.next_billing_date).toBeNull();
  });

  it('stripe_subscription_idがあってもstripe_customer_idがない場合はsubscription情報を取得する', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 86400;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        id: 'sub_nocust', status: 'active',
        current_period_end: periodEnd, cancel_at_period_end: false,
      }),
    }));

    const ctx = await createAuthContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'pro', stripe_customer_id: null, stripe_subscription_id: 'sub_nocust',
      },
    });
    const res = await onRequestGet(ctx);
    const json = await res.json();
    expect(json.subscription).not.toBeNull();
    expect(json.subscription.id).toBe('sub_nocust');
  });
});
