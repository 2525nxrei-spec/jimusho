/**
 * login API の追加エッジケーステスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/auth/login.js';
import { hashPassword } from '../functions/lib/crypto.js';
import { createMockDB } from './helpers.js';

describe('POST /api/auth/login — 追加エッジケース', () => {
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

  it('メールアドレスは大文字小文字を無視してログインできる', async () => {
    const salt = 'test-salt';
    const password = 'correctpass1';
    const hash = await hashPassword(password, salt);

    const res = await onRequestPost(createContext(
      { email: 'USER@EXAMPLE.COM', password },
      {
        _firstResult: {
          id: 'user-1', email: 'user@example.com', display_name: 'テスト',
          password_hash: hash, password_salt: salt, plan: 'free',
        },
      }
    ));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
  });

  it('passwordのみ提供（emailなし）の場合は400を返す', async () => {
    const res = await onRequestPost(createContext(
      { password: 'password123' }
    ));
    expect(res.status).toBe(400);
  });

  it('emailのみ提供（passwordなし）の場合は400を返す', async () => {
    const res = await onRequestPost(createContext(
      { email: 'user@example.com' }
    ));
    expect(res.status).toBe(400);
  });

  it('DB接続エラー時は500を返す', async () => {
    const res = await onRequestPost(createContext(
      { email: 'user@example.com', password: 'password123' },
      {
        _firstHandler: () => { throw new Error('DB connection timeout'); },
      }
    ));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('ログイン処理中にエラー');
  });

  it('トークンのJWT形式が正しい（3パート構成）', async () => {
    const salt = 'test-salt';
    const password = 'testpass123';
    const hash = await hashPassword(password, salt);

    const res = await onRequestPost(createContext(
      { email: 'user@example.com', password },
      {
        _firstResult: {
          id: 'user-1', email: 'user@example.com', display_name: null,
          password_hash: hash, password_salt: salt, plan: 'pro',
        },
      }
    ));
    expect(res.status).toBe(200);
    const json = await res.json();
    const parts = json.token.split('.');
    expect(parts).toHaveLength(3);

    // ユーザー情報にdisplay_nameがnullでも正常に返る
    expect(json.user.display_name).toBeNull();
    expect(json.user.plan).toBe('pro');
  });
});
