/**
 * register API の追加エッジケーステスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/auth/register.js';
import { createMockDB } from './helpers.js';

describe('POST /api/auth/register — 追加エッジケース', () => {
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

  it('メールアドレスの大文字は小文字に変換される', async () => {
    const res = await onRequestPost(createContext(
      { email: 'Test@EXAMPLE.COM', password: 'password123' },
      { _firstResult: null }
    ));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.email).toBe('test@example.com');
  });

  it('メールアドレスの前後にスペースがあると不正形式で400を返す', async () => {
    // register.jsではバリデーション（正規表現チェック）がtrimより前に実行されるため、
    // スペース付きのメールアドレスは不正形式として拒否される
    const res = await onRequestPost(createContext(
      { email: '  user@example.com  ', password: 'password123' },
      { _firstResult: null }
    ));
    expect(res.status).toBe(400);
  });

  it('DB挿入時にエラーが発生した場合は500を返す', async () => {
    const res = await onRequestPost(createContext(
      { email: 'test@example.com', password: 'password123' },
      {
        _firstResult: null,
        _runHandler: () => { throw new Error('D1 write error'); },
      }
    ));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('登録処理中にエラー');
  });

  it('@なしのメールアドレスは不正形式', async () => {
    const res = await onRequestPost(createContext(
      { email: 'invalid-email', password: 'password123' }
    ));
    expect(res.status).toBe(400);
  });

  it('ドメインなしのメールアドレスは不正形式', async () => {
    const res = await onRequestPost(createContext(
      { email: 'user@', password: 'password123' }
    ));
    expect(res.status).toBe(400);
  });

  it('display_nameが50文字ちょうどは許可される', async () => {
    const name50 = 'あ'.repeat(50);
    const res = await onRequestPost(createContext(
      { email: 'test@example.com', password: 'password123', display_name: name50 },
      { _firstResult: null }
    ));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.display_name).toBe(name50);
  });

  it('パスワードが8文字ちょうどは許可される', async () => {
    const res = await onRequestPost(createContext(
      { email: 'test@example.com', password: '12345678' },
      { _firstResult: null }
    ));
    expect(res.status).toBe(201);
  });
});
