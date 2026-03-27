/**
 * Webhook高度なテスト — DB障害・パラメータ検証・全イベント異常系
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

describe('Webhook — checkout.session.completedパラメータ検証', () => {
  it('bindに正しいcustomerId, subscriptionId, userIdが渡される', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_param_check',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { user_id: 'user-abc' },
          subscription: 'sub_xyz',
          customer: 'cus_789',
        },
      },
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
    // params: [customerId, subscriptionId, userId]
    expect(updateCall.params).toContain('cus_789');
    expect(updateCall.params).toContain('sub_xyz');
    expect(updateCall.params).toContain('user-abc');
  });

  it('metadataがnullの場合はDB更新しない', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_null_metadata',
      type: 'checkout.session.completed',
      data: { object: { metadata: null, subscription: 'sub_1', customer: 'cus_1' } },
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

describe('Webhook — customer.subscription.deletedパラメータ検証', () => {
  it('bindに正しいcustomer IDが渡される', async () => {
    const runCalls = [];
    const event = {
      id: 'evt_del_param',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_del', customer: 'cus_del_123' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    const updateCall = runCalls.find(c => c.sql.includes("plan = 'free'"));
    expect(updateCall).toBeDefined();
    expect(updateCall.params).toContain('cus_del_123');
  });
});

describe('Webhook — customer.subscription.updated全ステータス', () => {
  for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'unpaid']) {
    it(`${status}ステータスではproに更新しない`, async () => {
      const runCalls = [];
      const event = {
        id: `evt_sub_${status}`,
        type: 'customer.subscription.updated',
        data: { object: { id: `sub_${status}`, customer: `cus_${status}`, status } },
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
  }
});

describe('Webhook — DB run()障害時のエラーハンドリング', () => {
  it('checkout.session.completedのDB更新失敗で500を返す', async () => {
    const event = {
      id: 'evt_db_run_fail',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { user_id: 'user-fail' },
          subscription: 'sub_fail',
          customer: 'cus_fail',
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql) => {
        if (sql.includes("plan = 'pro'")) throw new Error('D1 write error');
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });

  it('customer.subscription.deletedのDB更新失敗で500を返す', async () => {
    const event = {
      id: 'evt_del_db_fail',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1' } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql) => {
        if (sql.includes("plan = 'free'")) throw new Error('D1 write error');
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});

describe('Webhook — ログ記録の非UNIQUEエラー', () => {
  it('UNIQUE以外のDB書き込みエラーはconsole.errorに出力されるが200を返す', async () => {
    const event = {
      id: 'evt_log_other_err',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_log', attempt_count: 3 } },
    };
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, WEBHOOK_SECRET);

    const ctx = createContext(payload, signature, {
      _firstHandler: () => null,
      _runHandler: (sql) => {
        if (sql.includes('webhooks_log')) throw new Error('Disk full');
        return { success: true };
      },
    });
    const res = await onRequestPost(ctx);
    // ログ記録のエラーは握りつぶされて200を返す
    expect(res.status).toBe(200);
  });
});

describe('Webhook — 空のペイロード', () => {
  it('リクエストボディが空文字の場合は400を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'stripe-signature': 't=123,v1=abc',
      }),
      body: '',
    });
    const ctx = {
      request,
      env: { DB: createMockDB(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
    };
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
  });
});

describe('Webhook — 巨大ペイロード', () => {
  it('非常に大きなペイロードでもクラッシュしない', async () => {
    const largeData = 'x'.repeat(100000);
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'stripe-signature': 't=123,v1=abc',
      }),
      body: largeData,
    });
    const ctx = {
      request,
      env: { DB: createMockDB(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
    };
    const res = await onRequestPost(ctx);
    // 署名検証失敗で400
    expect([400, 500]).toContain(res.status);
  });
});
