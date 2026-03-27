/**
 * functions/api/auth/me.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../functions/api/auth/me.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('GET /api/auth/me', () => {
  const JWT_SECRET = 'test-jwt-secret';

  function createContext(headers = {}, dbOverrides = {}) {
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      headers: new Headers(headers),
    });
    const db = createMockDB(dbOverrides);
    return { request, env: { JWT_SECRET, DB: db } };
  }

  it('Authorizationヘッダーなしで401を返す', async () => {
    const res = await onRequestGet(createContext());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('認証');
  });

  it('無効なトークンで401を返す', async () => {
    const res = await onRequestGet(createContext({ Authorization: 'Bearer invalid.token' }));
    expect(res.status).toBe(401);
  });

  it('有効なトークンでユーザー情報を返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const mockUser = {
      id: 'user-1', email: 'test@example.com', display_name: 'テスト', plan: 'pro',
    };

    const res = await onRequestGet(createContext(
      { Authorization: `Bearer ${token}` },
      { _firstResult: mockUser }
    ));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.user.id).toBe('user-1');
    expect(json.user.email).toBe('test@example.com');
    expect(json.user.plan).toBe('pro');
  });
});
