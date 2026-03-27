/**
 * functions/api/auth/register.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/auth/register.js';
import { createMockDB } from './helpers.js';

describe('POST /api/auth/register', () => {
  const JWT_SECRET = 'test-jwt-secret';

  function createContext(body, dbOverrides = {}) {
    const request = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const db = createMockDB(dbOverrides);
    return { request, env: { JWT_SECRET, DB: db } };
  }

  it('emailが空の場合は400を返す', async () => {
    const res = await onRequestPost(createContext({ email: '', password: 'password123' }));
    expect(res.status).toBe(400);
  });

  it('passwordが空の場合は400を返す', async () => {
    const res = await onRequestPost(createContext({ email: 'test@example.com', password: '' }));
    expect(res.status).toBe(400);
  });

  it('不正なメールアドレス形式は400を返す', async () => {
    const res = await onRequestPost(createContext({ email: 'invalid-email', password: 'password123' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('メールアドレスの形式');
  });

  it('パスワードが8文字未満の場合は400を返す', async () => {
    const res = await onRequestPost(createContext({ email: 'test@example.com', password: '1234567' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('8文字以上');
  });

  it('表示名が50文字を超える場合は400を返す', async () => {
    const longName = 'あ'.repeat(51);
    const res = await onRequestPost(createContext({
      email: 'test@example.com', password: 'password123', display_name: longName,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('50文字以内');
  });

  it('既に登録済みのメールアドレスは409を返す', async () => {
    const res = await onRequestPost(createContext(
      { email: 'existing@example.com', password: 'password123' },
      {
        _firstHandler: (sql, params) => {
          // SELECT id FROM users WHERE email = ?
          if (sql.includes('SELECT id')) return { id: 'existing-user' };
          return null;
        },
      }
    ));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('既に登録');
  });

  it('正常な登録で201とトークンを返す', async () => {
    const res = await onRequestPost(createContext(
      { email: 'newuser@example.com', password: 'password123', display_name: 'テスト' },
      { _firstResult: null } // ユーザー未存在
    ));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.token).toBeDefined();
    expect(json.user.email).toBe('newuser@example.com');
    expect(json.user.plan).toBe('free');
    expect(json.user.display_name).toBe('テスト');
  });

  it('display_nameなしでも登録できる', async () => {
    const res = await onRequestPost(createContext(
      { email: 'noname@example.com', password: 'password123' },
      { _firstResult: null }
    ));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.display_name).toBeNull();
  });
});
