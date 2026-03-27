/**
 * functions/api/auth/login.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/auth/login.js';
import { hashPassword } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('POST /api/auth/login', () => {
  const JWT_SECRET = 'test-jwt-secret';

  function createContext(body, dbOverrides = {}) {
    const request = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const db = createMockDB(dbOverrides);
    return { request, env: { JWT_SECRET, DB: db } };
  }

  it('email/passwordが空の場合は400を返す', async () => {
    const res = await onRequestPost(createContext({ email: '', password: '' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('emailのみ空の場合は400を返す', async () => {
    const res = await onRequestPost(createContext({ email: '', password: 'pass1234' }));
    expect(res.status).toBe(400);
  });

  it('存在しないユーザーは401を返す', async () => {
    const res = await onRequestPost(createContext(
      { email: 'nouser@example.com', password: 'password123' },
      { _firstResult: null }
    ));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('パスワードが間違っている場合は401を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('correctpassword', salt);

    const res = await onRequestPost(createContext(
      { email: 'user@example.com', password: 'wrongpassword' },
      {
        _firstResult: {
          id: 'user-1', email: 'user@example.com', display_name: 'テスト',
          password_hash: hash, password_salt: salt, plan: 'free',
        },
      }
    ));
    expect(res.status).toBe(401);
  });

  it('正しい認証情報でトークンとユーザー情報を返す', async () => {
    const salt = 'test-salt';
    const password = 'correctpassword123';
    const hash = await hashPassword(password, salt);

    const res = await onRequestPost(createContext(
      { email: 'user@example.com', password },
      {
        _firstResult: {
          id: 'user-1', email: 'user@example.com', display_name: 'テスト太郎',
          password_hash: hash, password_salt: salt, plan: 'pro',
        },
      }
    ));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.token).toBeDefined();
    expect(json.token.split('.')).toHaveLength(3);
    expect(json.user.id).toBe('user-1');
    expect(json.user.email).toBe('user@example.com');
    expect(json.user.plan).toBe('pro');
  });
});
