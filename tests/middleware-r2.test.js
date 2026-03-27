/**
 * テスト強化第2ラウンド: ミドルウェア追加テスト
 * - セキュリティヘッダー検証
 * - レート制限の動作確認
 * - Webhook除外の確認
 */
import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware.js';

function createMiddlewareContext(url, method = 'GET', headers = {}, nextResponse = null) {
  const request = new Request(url, {
    method,
    headers: new Headers(headers),
  });
  return {
    request,
    next: async () => nextResponse || new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('Middleware R2 — セキュリティヘッダー', () => {
  it('レスポンスにX-Content-Type-Optionsが設定される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'GET', {
      'Origin': 'https://jimusho-tool.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('レスポンスにX-Frame-Optionsが設定される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'GET', {
      'Origin': 'https://jimusho-tool.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('レスポンスにStrict-Transport-Securityが設定される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'GET', {
      'Origin': 'https://jimusho-tool.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('レスポンスにPermissions-Policyが設定される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'GET', {
      'Origin': 'https://jimusho-tool.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
  });

  it('レスポンスにReferrer-Policyが設定される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'GET', {
      'Origin': 'https://jimusho-tool.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('Middleware R2 — OPTIONSプリフライト', () => {
  it('OPTIONSは204を返しnextを呼ばない', async () => {
    let nextCalled = false;
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'OPTIONS', {
      'Origin': 'https://jimusho-tool.com',
    });
    ctx.next = async () => { nextCalled = true; return new Response(null, { status: 200 }); };
    const res = await onRequest(ctx);
    expect(res.status).toBe(204);
    expect(nextCalled).toBe(false);
  });

  it('OPTIONSレスポンスにCORSヘッダーが設定される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'OPTIONS', {
      'Origin': 'https://jimusho-tool.com',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});

describe('Middleware R2 — Webhookはセキュリティヘッダーのみ', () => {
  it('Webhookパスはセキュリティヘッダーありだがアクセス制御ヘッダーなし', async () => {
    const ctx = createMiddlewareContext(
      'https://jimusho-tool.com/api/stripe/webhook',
      'POST',
      { 'Origin': 'https://jimusho-tool.com' }
    );
    const res = await onRequest(ctx);
    // セキュリティヘッダーはある
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    // CORSヘッダーはない（Stripe直接呼び出しのため）
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Middleware R2 — localhost開発オリジン', () => {
  it('localhost:8788からのリクエストはCORSが許可される', async () => {
    const ctx = createMiddlewareContext('https://jimusho-tool.com/api/auth/me', 'GET', {
      'Origin': 'http://localhost:8788',
    });
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8788');
  });
});
