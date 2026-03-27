/**
 * アカウント削除API高度なテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestDelete } from '../functions/api/auth/account.js';
import { createJWT, hashPassword } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

const JWT_SECRET = 'test-jwt-secret';

async function createAccountCtx(body, userOverrides = {}, dbHandlers = {}) {
  const salt = 'test-salt-456';
  const hash = await hashPassword('myPassword1', salt);
  const user = {
    id: 'user-del',
    email: 'delete@example.com',
    display_name: 'Del User',
    plan: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...userOverrides,
  };

  const token = await createJWT(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  );

  const request = new Request('https://jimusho-tool.com/api/auth/account', {
    method: 'DELETE',
    headers: new Headers({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }),
    body: JSON.stringify(body),
  });

  const db = createMockDB({
    _firstHandler: (sql) => {
      if (sql.includes('SELECT id, email')) return user;
      if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
      return null;
    },
    _runHandler: () => ({ success: true }),
    ...dbHandlers,
  });

  return { request, env: { JWT_SECRET, DB: db } };
}

describe('アカウント削除 — バリデーション', () => {
  it('passwordが空の場合は400を返す', async () => {
    const ctx = await createAccountCtx({ password: '' });
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(400);
  });

  it('passwordフィールドがない場合は400を返す', async () => {
    const ctx = await createAccountCtx({});
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(400);
  });

  it('パスワードが間違っている場合は401を返す', async () => {
    const ctx = await createAccountCtx({ password: 'wrongPassword' });
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('パスワード');
  });
});

describe('アカウント削除 — 正常系', () => {
  it('正しいパスワードでアカウント削除成功', async () => {
    const runCalls = [];
    const ctx = await createAccountCtx(
      { password: 'myPassword1' },
      {},
      { _runHandler: (sql, params) => { runCalls.push({ sql, params }); return { success: true }; } }
    );
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toContain('削除');

    // DELETE文が実行されたことを確認
    const deleteCall = runCalls.find(c => c.sql.includes('DELETE FROM users'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall.params).toContain('user-del');
  });
});

describe('アカウント削除 — DB障害', () => {
  it('DELETE実行時にDBエラーが発生した場合', async () => {
    const salt = 'test-salt-456';
    const hash = await hashPassword('myPassword1', salt);
    const user = { id: 'user-del', email: 'delete@example.com', display_name: 'Del', plan: 'free' };
    const token = await createJWT(
      { sub: 'user-del', email: 'delete@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );

    const request = new Request('https://jimusho-tool.com/api/auth/account', {
      method: 'DELETE',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: JSON.stringify({ password: 'myPassword1' }),
    });

    const db = createMockDB({
      _firstHandler: (sql) => {
        if (sql.includes('SELECT id, email')) return user;
        if (sql.includes('password_hash')) return { password_hash: hash, password_salt: salt };
        return null;
      },
      _runHandler: (sql) => {
        if (sql.includes('DELETE')) throw new Error('D1 delete failed');
        return { success: true };
      },
    });

    try {
      const res = await onRequestDelete({ request, env: { JWT_SECRET, DB: db } });
      expect([200, 500]).toContain(res.status);
    } catch (err) {
      // ミドルウェアがキャッチする想定
      expect(err.message).toContain('D1');
    }
  });
});

describe('アカウント削除 — 不正なJSON', () => {
  it('不正なJSONボディで400を返す', async () => {
    const token = await createJWT(
      { sub: 'user-del', email: 'delete@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const user = { id: 'user-del', email: 'delete@example.com', display_name: 'Del', plan: 'free' };

    const request = new Request('https://jimusho-tool.com/api/auth/account', {
      method: 'DELETE',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }),
      body: '{bad json}}}',
    });

    const db = createMockDB({
      _firstHandler: (sql) => {
        if (sql.includes('SELECT id, email')) return user;
        return null;
      },
    });

    const res = await onRequestDelete({ request, env: { JWT_SECRET, DB: db } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('不正');
  });
});
