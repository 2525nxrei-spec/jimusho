/**
 * ミドルウェアの追加テスト（レート制限、セキュリティヘッダー）
 */
import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware.js';

describe('_middleware.js — レート制限', () => {
  function createContext(url, method = 'GET', origin = 'https://jimusho-tool.com', ip = '192.168.1.1') {
    const request = new Request(url, {
      method,
      headers: {
        Origin: origin,
        'CF-Connecting-IP': ip,
      },
    });
    return {
      request,
      next: async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  it('多数のリクエストを送ってもクラッシュしない', async () => {
    // 大量のリクエストを送信してもエラーにならないことを確認
    const promises = [];
    for (let i = 0; i < 15; i++) {
      const ctx = createContext(
        'https://jimusho-tool.com/api/auth/login',
        'POST',
        'https://jimusho-tool.com',
        `10.0.0.${i}` // 各IPは異なるので制限にかからない
      );
      promises.push(onRequest(ctx));
    }
    const results = await Promise.all(promises);
    results.forEach(res => {
      expect([200, 429]).toContain(res.status);
    });
  });

  it('Webhook経路はレート制限の対象外', async () => {
    // Webhookは何回呼んでも429にならない
    for (let i = 0; i < 5; i++) {
      const ctx = createContext(
        'https://jimusho-tool.com/api/stripe/webhook',
        'POST',
        'https://jimusho-tool.com',
        '10.0.1.1'
      );
      const res = await onRequest(ctx);
      expect(res.status).toBe(200);
    }
  });
});

describe('_middleware.js — セキュリティヘッダー詳細', () => {
  function createContext(url, method = 'GET', origin = 'https://jimusho-tool.com') {
    const request = new Request(url, {
      method,
      headers: {
        Origin: origin,
        'CF-Connecting-IP': '192.168.99.99',
      },
    });
    return {
      request,
      next: async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  it('全セキュリティヘッダーが付与されている', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/auth/me');
    const res = await onRequest(ctx);

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
  });

  it('OPTIONSリクエストにはCORSヘッダーのみ（セキュリティヘッダーはミドルウェア処理で付与される）', async () => {
    const ctx = createContext('https://jimusho-tool.com/api/auth/me', 'OPTIONS');
    const res = await onRequest(ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });

  it('Originヘッダーがない場合はデフォルトオリジンが設定される', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': '192.168.99.98' },
    });
    const ctx = {
      request,
      next: async () => new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    };
    const res = await onRequest(ctx);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
  });
});
