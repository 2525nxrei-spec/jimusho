/**
 * functions/lib/auth.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { authenticateUser } from '../functions/lib/auth.js';
import { createJWT } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('auth.js — authenticateUser', () => {
  const JWT_SECRET = 'test-secret-key';

  it('Authorizationヘッダーがない場合はnullを返す', async () => {
    const request = new Request('https://example.com/api/auth/me');
    const env = { JWT_SECRET, DB: createMockDB() };
    const user = await authenticateUser(request, env);
    expect(user).toBeNull();
  });

  it('Bearer形式でないヘッダーはnullを返す', async () => {
    const request = new Request('https://example.com/api/auth/me', {
      headers: { Authorization: 'Basic abc123' },
    });
    const env = { JWT_SECRET, DB: createMockDB() };
    const user = await authenticateUser(request, env);
    expect(user).toBeNull();
  });

  it('無効なJWTトークンはnullを返す', async () => {
    const request = new Request('https://example.com/api/auth/me', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    const env = { JWT_SECRET, DB: createMockDB() };
    const user = await authenticateUser(request, env);
    expect(user).toBeNull();
  });

  it('有効なJWTでユーザーが見つかる場合はユーザーを返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://example.com/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const mockUser = { id: 'user-1', email: 'test@example.com', display_name: 'テスト', plan: 'free' };
    const db = createMockDB({ _firstResult: mockUser });
    const env = { JWT_SECRET, DB: db };

    const user = await authenticateUser(request, env);
    expect(user).toEqual(mockUser);
  });

  it('有効なJWTだがDBにユーザーがいない場合はnullを返す', async () => {
    const token = await createJWT(
      { sub: 'user-999', email: 'gone@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://example.com/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const db = createMockDB({ _firstResult: null });
    const env = { JWT_SECRET, DB: db };

    const user = await authenticateUser(request, env);
    expect(user).toBeNull();
  });
});
