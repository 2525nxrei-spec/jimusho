/**
 * functions/api/auth/account.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestDelete } from '../functions/api/auth/account.js';
import { createJWT, hashPassword } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('DELETE /api/auth/account', () => {
  const JWT_SECRET = 'test-jwt-secret';

  async function createContext(body, dbOverrides = {}, authenticated = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) {
      const token = await createJWT(
        { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET
      );
      headers['Authorization'] = `Bearer ${token}`;
    }
    const request = new Request('https://jimusho-tool.com/api/auth/account', {
      method: 'DELETE',
      headers: new Headers(headers),
      body: JSON.stringify(body),
    });
    const db = createMockDB(dbOverrides);
    return { request, env: { JWT_SECRET, DB: db } };
  }

  it('未認証の場合は401を返す', async () => {
    const ctx = await createContext({ password: 'test123' }, {}, false);
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(401);
  });

  it('パスワードが空の場合は400を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('mypass123', salt);
    const ctx = await createContext(
      { password: '' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(400);
  });

  it('パスワードが間違っている場合は401を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('correctpass', salt);
    const ctx = await createContext(
      { password: 'wrongpass' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(401);
  });

  it('正常なアカウント削除で200を返す', async () => {
    const salt = 'test-salt';
    const password = 'correctpass123';
    const hash = await hashPassword(password, salt);
    const ctx = await createContext(
      { password },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('アカウントを削除');
  });
});
