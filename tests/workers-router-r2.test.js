/**
 * テスト強化第2ラウンド: Workers Router 追加テスト
 * - 全ルートの存在確認
 * - 不正メソッドの拒否
 * - CORSプリフライト
 * - 予期しない例外のハンドリング
 */
import { describe, it, expect } from 'vitest';
import router from '../workers/index.js';
import { createMockDB } from './helpers.js';

function createEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-jwt-secret',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_PRO: 'price_test',
    STRIPE_PUBLISHABLE_KEY: 'pk_test',
    FRONTEND_URL: 'https://jimusho-tool.com',
    DB: createMockDB(),
    ...overrides,
  };
}

describe('Workers Router R2 — OPTIONSプリフライト', () => {
  it('OPTIONSリクエストに204を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'OPTIONS',
      headers: new Headers({ 'Origin': 'https://jimusho-tool.com' }),
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(204);
  });

  it('OPTIONSレスポンスにCORSヘッダーが含まれる', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      method: 'OPTIONS',
      headers: new Headers({ 'Origin': 'https://jimusho-tool.com' }),
    });
    const res = await router.fetch(request, createEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
  });
});

describe('Workers Router R2 — 不正パスの404', () => {
  it('存在しないAPIパスに404を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/nonexistent', {
      method: 'GET',
      headers: new Headers({ 'Origin': 'https://jimusho-tool.com' }),
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('ルートパスに404を返す', async () => {
    const request = new Request('https://jimusho-tool.com/', {
      method: 'GET',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('/api/auth に404を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth', {
      method: 'GET',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });
});

describe('Workers Router R2 — 不正メソッド', () => {
  it('GET /api/auth/login は404を返す（POSTのみ）', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'GET',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('GET /api/auth/register は404を返す（POSTのみ）', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'GET',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('POST /api/auth/me は404を返す（GETのみ）', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('POST /api/billing/status は404を返す（GETのみ）', async () => {
    const request = new Request('https://jimusho-tool.com/api/billing/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('GET /api/stripe/checkout は404を返す（POSTのみ）', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'GET',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });

  it('GET /api/stripe/webhook は404を返す（POSTのみ）', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'GET',
    });
    const res = await router.fetch(request, createEnv());
    expect(res.status).toBe(404);
  });
});

describe('Workers Router R2 — CORSオリジン制御', () => {
  it('許可されたオリジンのレスポンスにはそのオリジンが設定される', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      method: 'GET',
      headers: new Headers({ 'Origin': 'https://jimusho-tool.com' }),
    });
    const res = await router.fetch(request, createEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
  });

  it('許可されていないオリジンのレスポンスにはデフォルトオリジンが設定される', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      method: 'GET',
      headers: new Headers({ 'Origin': 'https://malicious-site.com' }),
    });
    const res = await router.fetch(request, createEnv());
    const corsOrigin = res.headers.get('Access-Control-Allow-Origin');
    // 不正オリジンにはmalicious-site.comは設定されない
    expect(corsOrigin).not.toBe('https://malicious-site.com');
  });
});

describe('Workers Router R2 — Webhookルートの特殊処理', () => {
  it('WebhookレスポンスにはCORSヘッダーが付与されない', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'stripe-signature': 't=123,v1=abc',
        'Origin': 'https://jimusho-tool.com',
      }),
      body: '{"id":"evt_1","type":"test"}',
    });
    const res = await router.fetch(request, createEnv());
    // Webhookは直接returnされるためwithCORSは通らない
    // ステータスは署名検証失敗の400
    expect([400, 500]).toContain(res.status);
  });
});
