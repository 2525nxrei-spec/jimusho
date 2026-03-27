/**
 * functions/api/auth/password.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestPut } from '../functions/api/auth/password.js';
import { createJWT, hashPassword } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('PUT /api/auth/password', () => {
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
    const request = new Request('https://jimusho-tool.com/api/auth/password', {
      method: 'PUT',
      headers: new Headers(headers),
      body: JSON.stringify(body),
    });
    const db = createMockDB(dbOverrides);
    return { request, env: { JWT_SECRET, DB: db } };
  }

  it('未認証の場合は401を返す', async () => {
    const ctx = await createContext({ current_password: 'old', new_password: 'new12345' }, {}, false);
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(401);
  });

  it('current_passwordが空の場合は400を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('oldpass123', salt);
    const ctx = await createContext(
      { current_password: '', new_password: 'newpass123' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(400);
  });

  it('新パスワードが8文字未満の場合は400を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('oldpass123', salt);
    const ctx = await createContext(
      { current_password: 'oldpass123', new_password: 'short' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('8文字以上');
  });

  it('新パスワードに英字と数字の両方が必要', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('oldpass123', salt);
    const ctx = await createContext(
      { current_password: 'oldpass123', new_password: 'onlyletters' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('英字と数字');
  });

  it('現在のパスワードが間違っている場合は401を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('correctpass1', salt);
    const ctx = await createContext(
      { current_password: 'wrongpass1', new_password: 'newpass123' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(401);
  });

  it('正常なパスワード変更で200を返す', async () => {
    const salt = 'test-salt';
    const currentPassword = 'oldpass123';
    const hash = await hashPassword(currentPassword, salt);
    const ctx = await createContext(
      { current_password: currentPassword, new_password: 'newpass456' },
      {
        _firstHandler: (sql) => {
          if (sql.includes('SELECT id')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
          if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
          return null;
        },
      }
    );
    const res = await onRequestPut(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('パスワードを変更');
  });
});
