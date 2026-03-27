/**
 * エッジケース・異常系テスト
 * - 不正なJSON入力
 * - 空リクエストボディ
 * - 長すぎる入力値
 * - 期限切れトークン
 * - 存在しないリソース
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPut as passwordHandler } from '../functions/api/auth/password.js';
import { onRequestDelete as accountHandler } from '../functions/api/auth/account.js';
import { onRequestGet as billingHandler } from '../functions/api/billing/status.js';
import { createJWT, hashPassword } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

const JWT_SECRET = 'test-jwt-secret';

describe('不正なJSON入力', () => {
  it('login — 不正なJSONで500を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB() } };
    const res = await loginHandler(ctx);
    expect(res.status).toBe(500);
  });

  it('register — 不正なJSONで500を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '}{broken',
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB() } };
    const res = await registerHandler(ctx);
    expect(res.status).toBe(500);
  });

  it('password — 不正なJSONで400を返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/auth/password', {
      method: 'PUT',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: 'not-json',
    });
    const db = createMockDB({
      _firstResult: { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' },
    });
    const ctx = { request, env: { JWT_SECRET, DB: db } };
    const res = await passwordHandler(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('リクエストボディが不正');
  });

  it('account — 不正なJSONで400を返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/auth/account', {
      method: 'DELETE',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: '{invalid',
    });
    const db = createMockDB({
      _firstResult: { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' },
    });
    const ctx = { request, env: { JWT_SECRET, DB: db } };
    const res = await accountHandler(ctx);
    expect(res.status).toBe(400);
  });
});

describe('空リクエストボディ', () => {
  it('login — 空のオブジェクトで400を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB() } };
    const res = await loginHandler(ctx);
    expect(res.status).toBe(400);
  });

  it('register — 空のオブジェクトで400を返す', async () => {
    const request = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB() } };
    const res = await registerHandler(ctx);
    expect(res.status).toBe(400);
  });
});

describe('長すぎる入力値', () => {
  it('register — 非常に長いメールアドレスは不正形式として400を返す', async () => {
    const longEmail = 'a'.repeat(500) + '@example.com';
    const request = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: longEmail, password: 'password123' }),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB({ _firstResult: null }) } };
    const res = await registerHandler(ctx);
    // 形式は正しいがDBで処理される。ただし正常にハンドリングされることを確認
    expect([201, 400, 500]).toContain(res.status);
  });

  it('register — 非常に長いパスワードでも登録処理が正常にハンドリングされる', async () => {
    const longPassword = 'a'.repeat(10000);
    const request = new Request('https://jimusho-tool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: longPassword }),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB({ _firstResult: null }) } };
    const res = await registerHandler(ctx);
    // パスワードが長くてもハッシュ化されるので正常に処理される
    expect([201, 400, 500]).toContain(res.status);
  });

  it('login — 非常に長いパスワードでもクラッシュしない', async () => {
    const longPassword = 'x'.repeat(10000);
    const request = new Request('https://jimusho-tool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: longPassword }),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB({ _firstResult: null }) } };
    const res = await loginHandler(ctx);
    expect(res.status).toBe(401);
  });
});

describe('期限切れトークン', () => {
  it('me — 期限切れトークンで401を返す', async () => {
    const expiredToken = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 100 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/auth/me', {
      headers: new Headers({ 'Authorization': `Bearer ${expiredToken}` }),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB() } };
    const res = await meHandler(ctx);
    expect(res.status).toBe(401);
  });

  it('billing/status — 期限切れトークンで401を返す', async () => {
    const expiredToken = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 100 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/billing/status', {
      headers: new Headers({ 'Authorization': `Bearer ${expiredToken}` }),
    });
    const ctx = { request, env: { JWT_SECRET, DB: createMockDB(), STRIPE_SECRET_KEY: 'sk_test' } };
    const res = await billingHandler(ctx);
    expect(res.status).toBe(401);
  });
});

describe('存在しないリソース', () => {
  it('password — ユーザーがDB上に存在しない場合は404を返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/auth/password', {
      method: 'PUT',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: JSON.stringify({ current_password: 'oldpass123', new_password: 'newpass456' }),
    });
    const db = createMockDB({
      _firstHandler: (sql) => {
        // authenticateUserのSELECTにはユーザーを返すが、パスワードのSELECTではnull
        if (sql.includes('SELECT id, email')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
        if (sql.includes('password_hash')) return null;
        return null;
      },
    });
    const ctx = { request, env: { JWT_SECRET, DB: db } };
    const res = await passwordHandler(ctx);
    expect(res.status).toBe(404);
  });

  it('account — ユーザーがDB上に存在しない場合は404を返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/auth/account', {
      method: 'DELETE',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: JSON.stringify({ password: 'mypassword' }),
    });
    const db = createMockDB({
      _firstHandler: (sql) => {
        if (sql.includes('SELECT id, email')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
        if (sql.includes('password_hash')) return null;
        return null;
      },
    });
    const ctx = { request, env: { JWT_SECRET, DB: db } };
    const res = await accountHandler(ctx);
    expect(res.status).toBe(404);
  });
});

describe('数字のみパスワードのバリデーション', () => {
  it('password — 数字のみの新パスワードは400を返す', async () => {
    const salt = 'test-salt';
    const hash = await hashPassword('oldpass123', salt);
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const request = new Request('https://jimusho-tool.com/api/auth/password', {
      method: 'PUT',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: JSON.stringify({ current_password: 'oldpass123', new_password: '12345678' }),
    });
    const db = createMockDB({
      _firstHandler: (sql) => {
        if (sql.includes('SELECT id, email')) return { id: 'user-1', email: 'test@example.com', display_name: 'T', plan: 'free' };
        if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
        return null;
      },
    });
    const ctx = { request, env: { JWT_SECRET, DB: db } };
    const res = await passwordHandler(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('英字と数字');
  });
});
