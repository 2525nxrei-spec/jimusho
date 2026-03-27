/**
 * 認可テスト — 全エンドポイントのアクセス制御
 * - 未認証アクセス
 * - 不正トークン
 * - 改ざんされたJWT
 * - 異なるsecretで署名されたJWT
 */
import { describe, it, expect } from 'vitest';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPut as passwordHandler } from '../functions/api/auth/password.js';
import { onRequestDelete as accountHandler } from '../functions/api/auth/account.js';
import { onRequestGet as billingHandler } from '../functions/api/billing/status.js';
import { onRequestPost as checkoutHandler } from '../functions/api/stripe/checkout.js';
import { onRequestPost as portalHandler } from '../functions/api/stripe/portal.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

const JWT_SECRET = 'test-jwt-secret';

function createCtx(url, method, headers = {}, envOverrides = {}) {
  const request = new Request(url, {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
    body: method !== 'GET' ? JSON.stringify({}) : undefined,
  });
  return {
    request,
    env: {
      JWT_SECRET,
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_PRICE_PRO: 'price_test',
      FRONTEND_URL: 'https://jimusho-tool.com',
      DB: createMockDB(),
      ...envOverrides,
    },
  };
}

describe('認可テスト — 完全に未認証', () => {
  const endpoints = [
    { name: 'GET /api/auth/me', handler: meHandler, url: 'https://jimusho-tool.com/api/auth/me', method: 'GET' },
    { name: 'PUT /api/auth/password', handler: passwordHandler, url: 'https://jimusho-tool.com/api/auth/password', method: 'PUT' },
    { name: 'DELETE /api/auth/account', handler: accountHandler, url: 'https://jimusho-tool.com/api/auth/account', method: 'DELETE' },
    { name: 'GET /api/billing/status', handler: billingHandler, url: 'https://jimusho-tool.com/api/billing/status', method: 'GET' },
    { name: 'POST /api/stripe/checkout', handler: checkoutHandler, url: 'https://jimusho-tool.com/api/stripe/checkout', method: 'POST' },
    { name: 'POST /api/stripe/portal', handler: portalHandler, url: 'https://jimusho-tool.com/api/stripe/portal', method: 'POST' },
  ];

  for (const ep of endpoints) {
    it(`${ep.name} — Authorizationヘッダーなしで401`, async () => {
      const ctx = createCtx(ep.url, ep.method);
      const res = await ep.handler(ctx);
      expect(res.status).toBe(401);
    });
  }
});

describe('認可テスト — 不正なトークン形式', () => {
  const badTokens = [
    { desc: 'ランダム文字列', token: 'not-a-jwt-token' },
    { desc: '2パートのトークン', token: 'part1.part2' },
    { desc: '空文字', token: '' },
    { desc: 'Bearer以外のスキーム', token: null, header: 'Basic dGVzdDp0ZXN0' },
  ];

  for (const { desc, token, header } of badTokens) {
    it(`GET /api/auth/me — ${desc}で401`, async () => {
      const authHeader = header || (token !== null ? `Bearer ${token}` : undefined);
      const headers = authHeader ? { Authorization: authHeader } : {};
      const ctx = createCtx('https://jimusho-tool.com/api/auth/me', 'GET', headers);
      const res = await meHandler(ctx);
      expect(res.status).toBe(401);
    });
  }
});

describe('認可テスト — 異なるsecretで署名されたJWT', () => {
  it('GET /api/auth/me — 別のsecretで署名されたトークンで401', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      'completely-different-secret'
    );
    const ctx = createCtx('https://jimusho-tool.com/api/auth/me', 'GET', {
      Authorization: `Bearer ${token}`,
    });
    const res = await meHandler(ctx);
    expect(res.status).toBe(401);
  });
});

describe('認可テスト — subが欠落したJWT', () => {
  it('GET /api/auth/me — subフィールドなしのJWTで401', async () => {
    const token = await createJWT(
      { email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const ctx = createCtx('https://jimusho-tool.com/api/auth/me', 'GET', {
      Authorization: `Bearer ${token}`,
    });
    const res = await meHandler(ctx);
    expect(res.status).toBe(401);
  });
});

describe('認可テスト — 有効なJWTだがDBにユーザーが存在しない', () => {
  const protectedEndpoints = [
    { name: 'PUT /api/auth/password', handler: passwordHandler, url: 'https://jimusho-tool.com/api/auth/password', method: 'PUT' },
    { name: 'DELETE /api/auth/account', handler: accountHandler, url: 'https://jimusho-tool.com/api/auth/account', method: 'DELETE' },
    { name: 'POST /api/stripe/checkout', handler: checkoutHandler, url: 'https://jimusho-tool.com/api/stripe/checkout', method: 'POST' },
    { name: 'POST /api/stripe/portal', handler: portalHandler, url: 'https://jimusho-tool.com/api/stripe/portal', method: 'POST' },
  ];

  for (const ep of protectedEndpoints) {
    it(`${ep.name} — DBにユーザーなしで401`, async () => {
      const token = await createJWT(
        { sub: 'nonexistent-user', email: 'gone@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET
      );
      const ctx = createCtx(ep.url, ep.method, {
        Authorization: `Bearer ${token}`,
      }, {
        DB: createMockDB({ _firstResult: null }),
      });
      const res = await ep.handler(ctx);
      expect(res.status).toBe(401);
    });
  }
});

describe('認可テスト — 期限切れトークンで全認証エンドポイント拒否', () => {
  const protectedEndpoints = [
    { name: 'PUT /api/auth/password', handler: passwordHandler, url: 'https://jimusho-tool.com/api/auth/password', method: 'PUT' },
    { name: 'DELETE /api/auth/account', handler: accountHandler, url: 'https://jimusho-tool.com/api/auth/account', method: 'DELETE' },
    { name: 'POST /api/stripe/checkout', handler: checkoutHandler, url: 'https://jimusho-tool.com/api/stripe/checkout', method: 'POST' },
    { name: 'POST /api/stripe/portal', handler: portalHandler, url: 'https://jimusho-tool.com/api/stripe/portal', method: 'POST' },
    { name: 'GET /api/billing/status', handler: billingHandler, url: 'https://jimusho-tool.com/api/billing/status', method: 'GET' },
  ];

  for (const ep of protectedEndpoints) {
    it(`${ep.name} — 期限切れトークンで401`, async () => {
      const token = await createJWT(
        { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );
      const ctx = createCtx(ep.url, ep.method, {
        Authorization: `Bearer ${token}`,
      });
      const res = await ep.handler(ctx);
      expect(res.status).toBe(401);
    });
  }
});
