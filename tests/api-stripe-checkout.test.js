/**
 * functions/api/stripe/checkout.js のテスト
 * Stripe APIはモックで代替（外部API呼び出し禁止）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/checkout.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('POST /api/stripe/checkout', () => {
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

  it('未認証の場合は401を返す', async () => {
    const ctx = await createContext({}, {}, false);
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
  });

  it('Price IDが未設定の場合は500を返す', async () => {
    const ctx = await createContext(
      {
        _firstResult: { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free', stripe_customer_id: 'cus_123', stripe_subscription_id: null },
      },
      { STRIPE_PRICE_PRO: '' }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('既存のstripe_customer_idがある場合はCheckoutセッションを作成する', async () => {
    // fetchをモック（Stripe APIの代わり）
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'cs_test_123', client_secret: 'cs_secret_abc' }),
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'テスト',
        plan: 'free', stripe_customer_id: 'cus_existing_123', stripe_subscription_id: null,
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.clientSecret).toBe('cs_secret_abc');
  });

  it('stripe_customer_idがない場合は顧客作成後にCheckoutセッションを作成する', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // 1回目: 顧客作成
        return Promise.resolve({ json: () => Promise.resolve({ id: 'cus_new_456' }) });
      }
      // 2回目: Checkoutセッション作成
      return Promise.resolve({ json: () => Promise.resolve({ id: 'cs_test_789', client_secret: 'cs_secret_def' }) });
    }));

    const ctx = await createContext({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'テスト',
        plan: 'free', stripe_customer_id: null, stripe_subscription_id: null,
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.clientSecret).toBe('cs_secret_def');
    expect(callCount).toBe(2); // 顧客作成 + セッション作成
  });
});
