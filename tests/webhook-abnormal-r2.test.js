/**
 * テスト強化第2ラウンド: Webhook異常系 — 全イベント×DB障害・データ不整合
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/stripe/webhook.js';
import { createMockDB } from './helpers.js';

const WEBHOOK_SECRET = 'whsec_test_secret_for_ci';

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
    env: { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, ...envOverrides },
  };
}

describe('Webhook R2 — subscription.updated DB更新エラー', () => {
  it('activeステータスでDB run()が失敗した場合500を返す', async () => {
    const event = {
      id: 'evt_sub_upd_db_fail',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql) => {
        if (sql.includes("plan = 'pro'")) throw new Error('D1 write timeout');
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('trialingステータスでDB run()が失敗した場合500を返す', async () => {
    const event = {
      id: 'evt_sub_trial_db_fail',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_t', customer: 'cus_t', status: 'trialing' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql) => {
        if (sql.includes("plan = 'pro'")) throw new Error('D1 connection refused');
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});

describe('Webhook R2 — checkout.session.completed data.object欠落', () => {
  it('data.objectが空オブジェクトの場合でも正常応答する', async () => {
    const event = {
      id: 'evt_checkout_empty_obj',
      type: 'checkout.session.completed',
      data: { object: {} },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: () => ({ success: true }),
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });

  it('subscription/customerがnullでもuser_idがあればDB更新する', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_checkout_null_sub',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'user-x' }, subscription: null, customer: null } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    // user_idがあるのでpro更新は実行される
    const updateCall = runCalls.find(c => c.sql.includes("plan = 'pro'"));
    expect(updateCall).toBeDefined();
    expect(updateCall.params).toContain('user-x');
  });
});

describe('Webhook R2 — 冪等性チェックでDB例外', () => {
  it('冪等性チェックのDB first()が例外をスローした場合500を返す', async () => {
    const event = {
      id: 'evt_idem_fail',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'u1' }, subscription: 'sub_1', customer: 'cus_1' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: (sql) => {
        if (sql.includes('webhooks_log')) throw new Error('D1 read timeout');
        return null;
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});

describe('Webhook R2 — invoice.payment_failedのattempt_count各種', () => {
  for (const count of [0, 1, 5, 99]) {
    it(`attempt_count=${count}で正常応答する`, async () => {
      const event = {
        id: `evt_pf_attempt_${count}`,
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_pf', attempt_count: count } },
      };
      const payload = JSON.stringify(event);
      const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

      const ctx = createContext(payload, signature, {
        _firstHandler: () => null,
        _runHandler: () => ({ success: true }),
      });
      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);
    });
  }
});

describe('Webhook R2 — 未対応イベント各種', () => {
  const unknownEvents = [
    'charge.succeeded',
    'charge.failed',
    'charge.refunded',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'customer.created',
    'customer.deleted',
    'invoice.paid',
    'invoice.created',
  ];
  for (const eventType of unknownEvents) {
    it(`${eventType}は200を返しDB更新なし`, async () => {
      const runCalls = [];
      const event = {
        id: `evt_unknown_${eventType.replace(/\./g, '_')}`,
        type: eventType,
        data: { object: { id: 'obj_1' } },
      };
      const payload = JSON.stringify(event);
      const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

      const ctx = createContext(payload, signature, {
        _firstHandler: () => null,
        _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
      });
      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);
      // plan変更のSQL実行なし（webhooks_logのINSERTのみ）
      const planUpdate = runCalls.find(c =>
        c.sql.includes("plan = 'pro'") || c.sql.includes("plan = 'free'")
      );
      expect(planUpdate).toBeUndefined();
    });
  }
});

describe('Webhook R2 — STRIPE_WEBHOOK_SECRET各種不正値', () => {
  it('undefinedで500を返す', async () => {
    const ctx = createContext('{}', 't=1,v1=abc', {}, { STRIPE_WEBHOOK_SECRET: undefined });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('nullで500を返す', async () => {
    const ctx = createContext('{}', 't=1,v1=abc', {}, { STRIPE_WEBHOOK_SECRET: null });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('false（偽値）で500を返す', async () => {
    const ctx = createContext('{}', 't=1,v1=abc', {}, { STRIPE_WEBHOOK_SECRET: false });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});
