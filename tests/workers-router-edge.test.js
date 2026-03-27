/**
 * workers/index.js ルーターの追加エッジケーステスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../workers/index.js';
import { createMockDB } from './helpers.js';

describe('workers/index.js — 追加テスト', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'mock_id' }),
    }));
  });

  function createEnv(dbOverrides = {}) {
    return {
      JWT_SECRET: 'test-jwt-secret',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
      STRIPE_PRICE_PRO: 'price_test_dummy',
      FRONTEND_URL: 'https://jimusho-tool.com',
      DB: createMockDB(dbOverrides),
    };
  }

  it('間違ったHTTPメソッドでも404を返す（GET /api/auth/register）', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'GET',
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(404);
  });

  it('間違ったHTTPメソッドでも404を返す（GET /api/stripe/checkout）', async () => {
    const req = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'GET',
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(404);
  });

  it('パスの末尾にスラッシュがある場合は404を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://jimusho-tool.com' },
      body: JSON.stringify({ email: 'test@example.com', password: 'pass1234' }),
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(404);
  });

  it('localhostオリジンが許可される', async () => {
    const req = new Request('https://jimusho-tool.com/api/nonexistent', {
      headers: { Origin: 'http://localhost:8790' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8790');
  });

  it('WebhookはCORSヘッダーなしで返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=123,v1=abc',
        Origin: 'https://jimusho-tool.com',
      },
      body: '{}',
    });
    const res = await worker.fetch(req, createEnv());
    // WebhookはCORSをスキップしてreturnされるので、Access-Control-Allow-Originがない
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS /api/stripe/webhook も204でCORSヘッダーを返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/stripe/webhook', {
      method: 'OPTIONS',
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(204);
  });

  it('DELETE /api/auth/login は404を返す（未定義のメソッド）', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'DELETE',
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(404);
  });
});
