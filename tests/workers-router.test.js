/**
 * workers/index.js のルーターテスト
 * 外部API（Stripe）はfetchモック使用
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../workers/index.js';
import { createMockDB } from './helpers.js';

describe('workers/index.js — ルーター', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // fetchモック（Stripe API用）
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

  it('OPTIONS リクエストは204を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'OPTIONS',
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
  });

  it('存在しないパスは404を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/nonexistent', {
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('POST /api/auth/register — emailなしで400を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://jimusho-tool.com' },
      body: JSON.stringify({ email: '', password: 'test1234' }),
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login — 存在しないユーザーで401を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://jimusho-tool.com' },
      body: JSON.stringify({ email: 'nouser@example.com', password: 'password123' }),
    });
    const res = await worker.fetch(req, createEnv({ _firstResult: null }));
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me — 未認証で401を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/auth/me', {
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(401);
  });

  it('POST /api/stripe/checkout — 未認証で401を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(401);
  });

  it('POST /api/stripe/portal — 未認証で401を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(401);
  });

  it('GET /api/billing/status — 未認証で401を返す', async () => {
    const req = new Request('https://jimusho-tool.com/api/billing/status', {
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.status).toBe(401);
  });

  it('CORSヘッダーが正しく設定される', async () => {
    const req = new Request('https://jimusho-tool.com/api/nonexistent', {
      headers: { Origin: 'https://jimusho-tool.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('許可されていないオリジンはデフォルトオリジンが設定される', async () => {
    const req = new Request('https://jimusho-tool.com/api/nonexistent', {
      headers: { Origin: 'https://evil.com' },
    });
    const res = await worker.fetch(req, createEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jimusho-tool.com');
  });
});
