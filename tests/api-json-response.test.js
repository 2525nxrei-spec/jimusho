/**
 * 全APIエンドポイントがJSON形式で応答することをテスト
 * 502 Bad Gatewayやプレーンテキストエラーの代わりにJSONが返ること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDB, createMockEnv, createRequest, parseResponse } from './helpers.js';
import { createJWT } from '../functions/lib/crypto.js';

// 各エンドポイントのインポート
import { onRequestPost as checkoutPost } from '../functions/api/stripe/checkout.js';
import { onRequestPost as portalPost } from '../functions/api/stripe/portal.js';
import { onRequestGet as stripeKeyGet } from '../functions/api/stripe/stripe-key.js';
import { onRequestPost as webhookPost } from '../functions/api/stripe/webhook.js';

describe('全APIエンドポイント — JSON応答保証', () => {
  const JWT_SECRET = 'test-jwt-secret-key-for-testing';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Content-TypeがJSONであることを検証するヘルパー
  function expectJSON(response) {
    const ct = response.headers.get('Content-Type') || '';
    expect(ct).toContain('application/json');
  }

  // === /api/stripe/checkout ===

  it('checkout: 未認証 → 401 JSON', async () => {
    const request = createRequest('https://jimusho-tool.com/api/stripe/checkout', { method: 'POST' });
    const ctx = { request, env: createMockEnv() };
    const res = await checkoutPost(ctx);
    expect(res.status).toBe(401);
    expectJSON(res);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('checkout: STRIPE_SECRET_KEY空 → 500 JSON（502でない）', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = createRequest('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const db = createMockDB({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'free', stripe_customer_id: 'cus_123', stripe_subscription_id: null,
      },
    });
    const ctx = { request, env: { ...createMockEnv({ DB: db }), STRIPE_SECRET_KEY: '' } };
    const res = await checkoutPost(ctx);
    expect(res.status).toBe(500);
    expect(res.status).not.toBe(502);
    expectJSON(res);
  });

  // === /api/stripe/portal ===

  it('portal: 未認証 → 401 JSON', async () => {
    const request = createRequest('https://jimusho-tool.com/api/stripe/portal', { method: 'POST' });
    const ctx = { request, env: createMockEnv() };
    const res = await portalPost(ctx);
    expect(res.status).toBe(401);
    expectJSON(res);
  });

  it('portal: STRIPE_SECRET_KEY空 → 500 JSON', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = createRequest('https://jimusho-tool.com/api/stripe/portal', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const db = createMockDB({
      _firstResult: {
        id: 'user-1', email: 'test@example.com', display_name: 'T',
        plan: 'pro', stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_123',
      },
    });
    const ctx = { request, env: { ...createMockEnv({ DB: db }), STRIPE_SECRET_KEY: '' } };
    const res = await portalPost(ctx);
    expect(res.status).toBe(500);
    expect(res.status).not.toBe(502);
    expectJSON(res);
  });

  // === /api/stripe/stripe-key ===

  it('stripe-key: 公開鍵設定済み → 200 JSON', async () => {
    const ctx = { env: createMockEnv() };
    const res = await stripeKeyGet(ctx);
    expect(res.status).toBe(200);
    expectJSON(res);
    const json = await res.json();
    expect(json.publishableKey).toBeTruthy();
  });

  it('stripe-key: 公開鍵未設定 → 500 JSON', async () => {
    const ctx = { env: { ...createMockEnv(), STRIPE_PUBLISHABLE_KEY: '' } };
    const res = await stripeKeyGet(ctx);
    expect(res.status).toBe(500);
    expectJSON(res);
  });

  // === /api/stripe/webhook ===

  it('webhook: STRIPE_WEBHOOK_SECRET未設定 → 500 JSON', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers: new Headers({ 'stripe-signature': 't=123,v1=abc' }),
    });
    const ctx = { request, env: { ...createMockEnv(), STRIPE_WEBHOOK_SECRET: '' } };
    const res = await webhookPost(ctx);
    expect(res.status).toBe(500);
    expectJSON(res);
  });

  it('webhook: 不正な署名 → 400 JSON', async () => {
    const request = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      body: '{"id":"evt_test"}',
      headers: new Headers({ 'stripe-signature': 't=999999999,v1=invalidsig' }),
    });
    const ctx = { request, env: createMockEnv() };
    const res = await webhookPost(ctx);
    // タイムスタンプ範囲外 or 署名不一致 → 400
    expect([400, 500]).toContain(res.status);
    expect(res.status).not.toBe(502);
    expectJSON(res);
  });
});
