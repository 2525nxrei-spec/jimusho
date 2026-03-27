/**
 * 登録バリデーション詳細テスト — メール形式、パスワード強度
 */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../functions/api/auth/register.js';
import { createMockDB } from './helpers.js';

const JWT_SECRET = 'test-jwt-secret';

function createCtx(body, dbOverrides = {}) {
  const request = new Request('https://jimusho-tool.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    request,
    env: { JWT_SECRET, DB: createMockDB({ _firstResult: null, ...dbOverrides }) },
  };
}

describe('登録 — メールアドレスバリデーション', () => {
  const invalidEmails = [
    { desc: '@なし', email: 'testexample.com' },
    { desc: 'ドメインなし', email: 'test@' },
    { desc: 'ローカル部なし', email: '@example.com' },
    { desc: 'スペース含む', email: 'test @example.com' },
    { desc: 'ドット欠落', email: 'test@examplecom' },
  ];

  for (const { desc, email } of invalidEmails) {
    it(`${desc}: ${email} は400を返す`, async () => {
      const ctx = createCtx({ email, password: 'validPass123' });
      const res = await onRequestPost(ctx);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('メールアドレス');
    });
  }

  const validEmails = [
    'user@example.com',
    'user.name@example.com',
    'user+tag@example.com',
    'a@b.co',
  ];

  for (const email of validEmails) {
    it(`正しい形式: ${email} は登録成功する`, async () => {
      const ctx = createCtx({ email, password: 'validPass1' });
      const res = await onRequestPost(ctx);
      expect(res.status).toBe(201);
    });
  }
});

describe('登録 — パスワードバリデーション', () => {
  it('7文字のパスワードは400を返す', async () => {
    const ctx = createCtx({ email: 'test@example.com', password: '1234567' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('8文字');
  });

  it('空のパスワードは400を返す', async () => {
    const ctx = createCtx({ email: 'test@example.com', password: '' });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
  });
});

describe('登録 — display_nameバリデーション', () => {
  it('51文字のdisplay_nameは400を返す', async () => {
    const ctx = createCtx({
      email: 'test@example.com',
      password: 'validPass1',
      display_name: 'a'.repeat(51),
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('50文字');
  });

  it('50文字のdisplay_nameは成功する', async () => {
    const ctx = createCtx({
      email: 'test@example.com',
      password: 'validPass1',
      display_name: 'a'.repeat(50),
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(201);
  });

  it('空のdisplay_nameは成功する（nullとして保存）', async () => {
    const ctx = createCtx({
      email: 'test@example.com',
      password: 'validPass1',
      display_name: '',
    });
    const res = await onRequestPost(ctx);
    // 空文字はfalsyなのでnullとして保存される
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.display_name).toBeNull();
  });
});

describe('登録 — 重複メールアドレス', () => {
  it('既に登録済みのメールアドレスは409を返す', async () => {
    const ctx = createCtx(
      { email: 'existing@example.com', password: 'validPass1' },
      { _firstResult: { id: 'existing-user' } }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('既に登録');
  });

  it('大文字で登録しても小文字に正規化されてチェックされる', async () => {
    const ctx = createCtx(
      { email: 'TEST@EXAMPLE.COM', password: 'validPass1' },
      {
        _firstHandler: (sql, params) => {
          // 小文字に変換されてバインドされることを確認
          if (sql.includes('WHERE email = ?') && params[0] === 'test@example.com') {
            return { id: 'existing' };
          }
          return null;
        },
      }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(409);
  });
});

describe('登録 — レスポンス形式', () => {
  it('成功時にtoken, user.id, user.email, user.plan, user.display_nameが返る', async () => {
    const ctx = createCtx({
      email: 'new@example.com',
      password: 'validPass1',
      display_name: 'Test',
    });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.token).toBeDefined();
    expect(json.token.split('.').length).toBe(3);
    expect(json.user).toBeDefined();
    expect(json.user.email).toBe('new@example.com');
    expect(json.user.plan).toBe('free');
    expect(json.user.display_name).toBe('Test');
    expect(json.user.id).toBeDefined();
  });
});

describe('登録 — DB障害', () => {
  it('DB INSERT失敗で500を返す', async () => {
    const ctx = createCtx(
      { email: 'test@example.com', password: 'validPass1' },
      {
        _firstResult: null,
        _runHandler: () => { throw new Error('D1 connection lost'); },
      }
    );
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(500);
  });
});
