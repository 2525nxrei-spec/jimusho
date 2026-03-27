/**
 * functions/api/stripe/webhook.js のテスト
 * 実際のverifyStripeSignatureを使い、正しいHMAC署名を生成してテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/webhook.js';
import { createMockDB } from './helpers.js';

/**
 * テスト用: Stripe Webhook署名を生成するヘルパー
 */
async function generateWebhookSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${signature}`;
}

describe('POST /api/stripe/webhook', () => {
  const WEBHOOK_SECRET = 'whsec_test_secret_for_ci';

  function createContext(payload, signature, dbOverrides = {}, envOverrides = {}) {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'stripe-signature': signature || '',
      }),
      body: payload,
    });
    const db = createMockDB(dbOverrides);
    return {
      request,
      env: {
        DB: db,
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        ...envOverrides,
      },
    };
  }

  it('STRIPE_WEBHOOK_SECRETが未設定の場合は500を返す', async () => {
    const ctx = createContext('{}', 't=123,v1=abc', {}, { STRIPE_WEBHOOK_SECRET: '' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('不正な署名で400を返す', async () => {
    const payload = '{"id":"evt_test","type":"test"}';
    const ctx = createContext(payload, 't=9999999999,v1=0000000000000000000000000000000000000000000000000000000000000000');
    const res = await onRequestPost(ctx);
    // タイムスタンプが未来すぎる or 署名不一致 → 400
    expect(res.status).toBe(400);
  });

  it('冪等性: 既に処理済みのイベントは受信済みとして返す', async () => {
    const event = { id: 'evt_already_processed', type: 'checkout.session.completed', data: { object: {} } };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: (sql) => {
        if (sql.includes('webhooks_log')) return { id: 'log-1' };
        return null;
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it('checkout.session.completedでユーザーをproに更新する', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_checkout_done',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { user_id: 'user-1' },
          subscription: 'sub_new',
          customer: 'cus_new',
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: (sql) => {
        if (sql.includes('webhooks_log')) return null;
        return null;
      },
      _runHandler: (sql, params) => {
        runCalls.push({ sql, params });
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    const updateCall = runCalls.find(c => c.sql.includes("plan = 'pro'"));
    expect(updateCall).toBeDefined();
  });

  it('customer.subscription.deletedでfreeに戻す', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_sub_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_123', customer: 'cus_123' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: (sql) => {
        if (sql.includes('webhooks_log')) return null;
        return null;
      },
      _runHandler: (sql, params) => {
        runCalls.push({ sql, params });
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    const updateCall = runCalls.find(c => c.sql.includes("plan = 'free'"));
    expect(updateCall).toBeDefined();
  });

  it('customer.subscription.updatedでactiveならproに更新する', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_123', customer: 'cus_123', status: 'active' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: (sql) => {
        if (sql.includes('webhooks_log')) return null;
        return null;
      },
      _runHandler: (sql, params) => {
        runCalls.push({ sql, params });
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    const updateCall = runCalls.find(c => c.sql.includes("plan = 'pro'"));
    expect(updateCall).toBeDefined();
  });

  it('invoice.payment_failedは正常に受信する（ログのみ）', async () => {
    const event = {
      id: 'evt_payment_failed',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_123', attempt_count: 1 } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: () => ({ success: true }),
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });
});
