/**
 * functions/_middleware.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware.js';

describe('_middleware.js', () => {
  function createContext(url, method = 'GET', origin = 'https://jimusho-tool.com', nextResponse = null) {
    const request = new Request(url, {
      method,
      headers: {
        Origin: origin,
        'CF-Connecting-IP': '192.168.1.1',
      },
    });
    return {
      request,
      next: async () => nextResponse || new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  it('OPTIONSリクエストは204を返しCORSヘッダーを付与する', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/auth/me', 'OPTIONS');
    const res = await onRequest(ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('通常のリクエストにCORSとセキュリティヘッダーを付与する', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/auth/me');
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('Webhookパスはセキュリティヘッダーのみ付与（CORSなし）', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/stripe/webhook', 'POST');
    const res = await onRequest(ctx);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    // WebhookはCORSヘッダーを付与しない
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('ローカルホストのオリジンも許可される', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/auth/me', 'GET', 'http://localhost:8788');
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8788');
  });

  it('許可されていないオリジンにはデフォルトオリジンを設定する', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/auth/me', 'GET', 'https://evil.com');
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
  });
});
