/**
 * Proツールサーバーサイドガード テスト
 * - 未認証でProツールURLにアクセスして403/302が返ることをテスト
 * - freeプランユーザーでProツールURLにアクセスして403/302が返ることをテスト
 * - proプランユーザーでProツールURLにアクセスして200が返ることをテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from '../functions/_middleware.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB, createMockEnv } from './helpers.js';

describe('Proツールサーバーサイドガード', () => {
  const JWT_SECRET = 'test-jwt-secret-key-for-testing';
  const PRO_TOOL_URL = 'https://jimusho-tool.com/tools/invoice-generator/';
  const FREE_TOOL_URL = 'https://jimusho-tool.com/tools/text-counter/';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // contextを作成するヘルパー
  function createContext(request, envOverrides = {}, nextResponse = null) {
    const env = createMockEnv(envOverrides);
    return {
      request,
      env,
      next: vi.fn().mockResolvedValue(
        nextResponse || new Response('<html>ツールページ</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      ),
    };
  }

  // === 未認証テスト ===

  it('未認証でProツールURLにアクセス（HTMLリクエスト）→ 302リダイレクト', async () => {
    const request = new Request(PRO_TOOL_URL, {
      headers: new Headers({ 'Accept': 'text/html,application/xhtml+xml' }),
    });
    const ctx = createContext(request);
    const res = await onRequest(ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/pages/pricing.html');
  });

  it('未認証でProツールURLにアクセス（APIリクエスト）→ 403 JSON', async () => {
    const request = new Request(PRO_TOOL_URL, {
      headers: new Headers({ 'Accept': 'application/json' }),
    });
    const ctx = createContext(request);
    const res = await onRequest(ctx);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('Proプラン');
  });

  // === freeプランユーザーテスト ===

  it('freeプランユーザーでProツールURLにアクセス → 403', async () => {
    const token = await createJWT(
      { sub: 'user-free', email: 'free@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request(PRO_TOOL_URL, {
      headers: new Headers({
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
    });
    const db = createMockDB({
      _firstHandler: (sql, params) => {
        if (sql.includes('SELECT plan')) return { plan: 'free' };
        return null;
      },
    });
    const ctx = createContext(request, { DB: db });
    const res = await onRequest(ctx);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('freeプランユーザーでProツールURLにアクセス（HTML）→ 302リダイレクト', async () => {
    const token = await createJWT(
      { sub: 'user-free', email: 'free@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request(PRO_TOOL_URL, {
      headers: new Headers({
        'Accept': 'text/html,application/xhtml+xml',
        'Authorization': `Bearer ${token}`,
      }),
    });
    const db = createMockDB({
      _firstHandler: (sql, params) => {
        if (sql.includes('SELECT plan')) return { plan: 'free' };
        return null;
      },
    });
    const ctx = createContext(request, { DB: db });
    const res = await onRequest(ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/pages/pricing.html');
  });

  // === proプランユーザーテスト ===

  it('proプランユーザーでProツールURLにアクセス → 200（通過）', async () => {
    const token = await createJWT(
      { sub: 'user-pro', email: 'pro@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request(PRO_TOOL_URL, {
      headers: new Headers({
        'Accept': 'text/html',
        'Authorization': `Bearer ${token}`,
      }),
    });
    const db = createMockDB({
      _firstHandler: (sql, params) => {
        if (sql.includes('SELECT plan')) return { plan: 'pro' };
        return null;
      },
    });
    const ctx = createContext(request, { DB: db });
    const res = await onRequest(ctx);
    // Proユーザーはnext()が呼ばれて200が返る
    expect(res.status).toBe(200);
    expect(ctx.next).toHaveBeenCalled();
  });

  // === 無料ツールはガードされない ===

  it('未認証で無料ツールURLにアクセス → 200（ガードなし）', async () => {
    const request = new Request(FREE_TOOL_URL, {
      headers: new Headers({ 'Accept': 'text/html' }),
    });
    const ctx = createContext(request);
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(ctx.next).toHaveBeenCalled();
  });

  // === 期限切れトークンテスト ===

  it('期限切れトークンでProツールURLにアクセス → 403', async () => {
    const expiredToken = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 100 },
      JWT_SECRET
    );
    const request = new Request(PRO_TOOL_URL, {
      headers: new Headers({
        'Accept': 'application/json',
        'Authorization': `Bearer ${expiredToken}`,
      }),
    });
    const ctx = createContext(request);
    const res = await onRequest(ctx);
    expect(res.status).toBe(403);
  });

  // === 全Proツールパスのテスト ===

  const ALL_PRO_TOOLS = [
    'invoice-generator', 'delivery-note', 'receipt-generator',
    'estimate-generator', 'expense-memo', 'revenue-tracker',
    'take-home-pay', 'sales-email', 'work-log',
  ];

  ALL_PRO_TOOLS.forEach(tool => {
    it(`未認証で /tools/${tool}/ にアクセス → 403`, async () => {
      const request = new Request(`https://jimusho-tool.com/tools/${tool}/`, {
        headers: new Headers({ 'Accept': 'application/json' }),
      });
      const ctx = createContext(request);
      const res = await onRequest(ctx);
      expect(res.status).toBe(403);
    });
  });
});
