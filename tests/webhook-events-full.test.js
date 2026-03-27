/**
 * Webhook全イベントの網羅テスト + 異常系
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
    env: {
      DB: db,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ...envOverrides,
    },
  };
}

describe('Webhook — customer.subscription.updated trialing', () => {
  it('trialingステータスでもproに更新する', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_sub_trialing',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_trial', customer: 'cus_trial', status: 'trialing' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    const updateCall = runCalls.find(c => c.sql.includes("plan = 'pro'"));
    expect(updateCall).toBeDefined();
  });
});

describe('Webhook — customer.subscription.updated inactive', () => {
  it('past_dueステータスではproに更新しない（DBへのUPDATE発生しない）', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_sub_past_due',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_pd', customer: 'cus_pd', status: 'past_due' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    // plan更新のUPDATEは発生しない（ログ記録のINSERTのみ）
    const planUpdate = runCalls.find(c => c.sql.includes("plan = 'pro'") || c.sql.includes("plan = 'free'"));
    expect(planUpdate).toBeUndefined();
  });
});

describe('Webhook — checkout.session.completed metadata欠落', () => {
  it('metadataにuser_idがない場合はDB更新しない', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_no_metadata',
      type: 'checkout.session.completed',
      data: { object: { metadata: {}, subscription: 'sub_x', customer: 'cus_x' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    const planUpdate = runCalls.find(c => c.sql.includes("plan = 'pro'"));
    expect(planUpdate).toBeUndefined();
  });
});

describe('Webhook — 未知のイベントタイプ', () => {
  it('未対応のイベントタイプでも200を返す', async () => {
    const event = {
      id: 'evt_unknown_type',
      type: 'payment_method.attached',
      data: { object: { id: 'pm_123' } },
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

describe('Webhook — ログ記録のUNIQUEエラーは無視される', () => {
  it('webhooks_logのUNIQUE制約違反は正常応答する', async () => {
    let runCallCount = 0;
    const event = {
      id: 'evt_log_dupe',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_dup', attempt_count: 2 } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql) => {
        runCallCount++;
        // ログ記録のINSERTでUNIQUEエラーをシミュレート
        if (sql.includes('webhooks_log')) throw new Error('UNIQUE constraint failed');
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });
});

describe('Webhook — signatureヘッダーなし', () => {
  it('stripe-signatureヘッダーが空の場合は400を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: '{"id":"evt_no_sig"}',
    });
    const ctx = {
      request,
      env: { DB: createMockDB(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
    };
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
  });
});

describe('Webhook — DB障害時のエラーハンドリング', () => {
  it('DB.prepare().first()が例外をスローした場合は500を返す', async () => {
    const event = {
      id: 'evt_db_error',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'u1' }, subscription: 'sub_1', customer: 'cus_1' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => { throw new Error('D1 database unavailable'); },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});
