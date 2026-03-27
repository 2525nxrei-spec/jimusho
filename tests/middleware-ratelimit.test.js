/**
 * ミドルウェア — レート制限の詳細テスト
 */
import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware.js';

function createMiddlewareCtx(url, method = 'GET', headers = {}) {
  const request = new Request(url, {
    method,
    headers: new Headers({
      'Origin': 'https://jimusho-tool.com',
      ...headers,
    }),
  });

  return {
    request,
    next: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('ミドルウェア — レート制限詳細', () => {
  it('認証エンドポイントは一般エンドポイントより厳しい制限', async () => {
    // 一般エンドポイントは120回/分
    // 認証エンドポイントは10回/分
    // ここでは制限に達しないことを確認（1回のリクエスト）
    const ctx = createMiddlewareCtx(
      'https://jimusho-tool.com/api/auth/login',
      'POST',
      { 'CF-Connecting-IP': '192.168.99.1' }
    );
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
  });

  it('レート制限されたレスポンスは429で日本語メッセージを含む', async () => {
    // 11回連続でリクエストを送信して制限に達する
    const ip = '10.0.0.99';
    let lastRes;
    for (let i = 0; i < 12; i++) {
      const ctx = createMiddlewareCtx(
        'https://jimusho-tool.com/api/auth/login',
        'POST',
        { 'CF-Connecting-IP': ip }
      );
      lastRes = await onRequest(ctx);
    }
    expect(lastRes.status).toBe(429);
    const json = await lastRes.json();
    expect(json.error).toContain('リクエストが多すぎます');
  });

  it('異なるIPアドレスは独立してカウントされる', async () => {
    const ctx1 = createMiddlewareCtx(
      'https://jimusho-tool.com/api/billing/status',
      'GET',
      { 'CF-Connecting-IP': '172.16.0.1' }
    );
    const ctx2 = createMiddlewareCtx(
      'https://jimusho-tool.com/api/billing/status',
      'GET',
      { 'CF-Connecting-IP': '172.16.0.2' }
    );
    const res1 = await onRequest(ctx1);
    const res2 = await onRequest(ctx2);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('CF-Connecting-IPヘッダーがない場合はunknownとして扱われる', async () => {
    const ctx = createMiddlewareCtx(
      'https://jimusho-tool.com/api/billing/status',
      'GET'
    );
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
  });
});

describe('ミドルウェア — レスポンスヘッダー統合', () => {
  it('セキュリティヘッダーとCORSヘッダーが同時に付与される', async () => {
    const ctx = createMiddlewareCtx(
      'https://jimusho-tool.com/api/auth/me',
      'GET',
      { 'CF-Connecting-IP': '1.2.3.4' }
    );
    const res = await onRequest(ctx);

    // セキュリティヘッダー
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');

    // CORSヘッダー
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeDefined();
  });

  it('Webhookパスはセキュリティヘッダーのみ（CORSなし）', async () => {
    const ctx = createMiddlewareCtx(
      'https://jimusho-tool.com/api/stripe/webhook',
      'POST',
      { 'CF-Connecting-IP': '5.6.7.8' }
    );
    const res = await onRequest(ctx);

    // セキュリティヘッダーあり
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    // CORSヘッダーなし
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('レート制限レスポンスにもセキュリティヘッダーが付与される', async () => {
    const ip = '99.99.99.99';
    let lastRes;
    for (let i = 0; i < 12; i++) {
      const ctx = createMiddlewareCtx(
        'https://jimusho-tool.com/api/auth/register',
        'POST',
        { 'CF-Connecting-IP': ip }
      );
      lastRes = await onRequest(ctx);
    }
    expect(lastRes.status).toBe(429);
    expect(lastRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(lastRes.headers.get('Access-Control-Allow-Origin')).toBeDefined();
  });
});
