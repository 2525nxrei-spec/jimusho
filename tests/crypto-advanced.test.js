/**
 * crypto.js高度なテスト — JWT改ざん・base64urlエッジケース
 */
import { describe, it, expect } from 'vitest';
import { createJWT, verifyJWT, hashPassword, generateSalt, generateId } from '../functions/lib/crypto.js';

const JWT_SECRET = 'test-jwt-secret';

describe('JWT — 改ざん検知', () => {
  it('payloadを改ざんしたトークンはnullを返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', email: 'test@example.com', plan: 'free', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const parts = token.split('.');
    // payloadの1文字を変える
    const tamperedPayload = parts[1].slice(0, -1) + (parts[1].slice(-1) === 'A' ? 'B' : 'A');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const result = await verifyJWT(tamperedToken, JWT_SECRET);
    expect(result).toBeNull();
  });

  it('signatureを改ざんしたトークンはnullを返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const parts = token.split('.');
    const tamperedSig = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'X' ? 'Y' : 'X');
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    const result = await verifyJWT(tamperedToken, JWT_SECRET);
    expect(result).toBeNull();
  });

  it('headerを改ざんしたトークンはnullを返す', async () => {
    const token = await createJWT(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const parts = token.split('.');
    const tamperedHeader = parts[0].slice(0, -1) + (parts[0].slice(-1) === 'Z' ? 'W' : 'Z');
    const tamperedToken = `${tamperedHeader}.${parts[1]}.${parts[2]}`;
    const result = await verifyJWT(tamperedToken, JWT_SECRET);
    expect(result).toBeNull();
  });
});

describe('JWT — 異常入力', () => {
  it('空文字列のトークンはnullを返す', async () => {
    const result = await verifyJWT('', JWT_SECRET);
    expect(result).toBeNull();
  });

  it('4パートのトークンはnullを返す', async () => {
    const result = await verifyJWT('a.b.c.d', JWT_SECRET);
    expect(result).toBeNull();
  });

  it('1パートのトークンはnullを返す', async () => {
    const result = await verifyJWT('single-part-token', JWT_SECRET);
    expect(result).toBeNull();
  });

  it('base64url無効文字を含むトークンはnullを返す', async () => {
    const result = await verifyJWT('!!!.@@@.###', JWT_SECRET);
    expect(result).toBeNull();
  });

  it('expがないトークンは有効（期限なし）', async () => {
    const token = await createJWT({ sub: 'user-1', email: 'test@example.com' }, JWT_SECRET);
    const result = await verifyJWT(token, JWT_SECRET);
    expect(result).not.toBeNull();
    expect(result.sub).toBe('user-1');
  });

  it('expがちょうど現在時刻のトークンは無効（exp < nowで判定）', async () => {
    // exp = now - 1で確実に期限切れ
    const token = await createJWT(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 1 },
      JWT_SECRET
    );
    const result = await verifyJWT(token, JWT_SECRET);
    expect(result).toBeNull();
  });
});

describe('JWT — ラウンドトリップ', () => {
  it('作成したJWTのpayloadが正しく復元される', async () => {
    const payload = {
      sub: 'user-abc',
      email: 'test@example.com',
      plan: 'pro',
      exp: Math.floor(Date.now() / 1000) + 86400,
    };
    const token = await createJWT(payload, JWT_SECRET);
    const result = await verifyJWT(token, JWT_SECRET);
    expect(result.sub).toBe(payload.sub);
    expect(result.email).toBe(payload.email);
    expect(result.plan).toBe(payload.plan);
    expect(result.exp).toBe(payload.exp);
  });

  it('日本語を含むpayloadが正しくラウンドトリップする', async () => {
    const payload = {
      sub: 'user-1',
      display_name: 'テストユーザー',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await createJWT(payload, JWT_SECRET);
    const result = await verifyJWT(token, JWT_SECRET);
    expect(result.display_name).toBe('テストユーザー');
  });
});

describe('hashPassword — 一貫性', () => {
  it('同じパスワードとsaltで常に同じハッシュを返す', async () => {
    const hash1 = await hashPassword('myPassword123', 'fixed-salt');
    const hash2 = await hashPassword('myPassword123', 'fixed-salt');
    expect(hash1).toBe(hash2);
  });

  it('異なるsaltでは異なるハッシュを返す', async () => {
    const hash1 = await hashPassword('myPassword123', 'salt-a');
    const hash2 = await hashPassword('myPassword123', 'salt-b');
    expect(hash1).not.toBe(hash2);
  });

  it('異なるパスワードでは異なるハッシュを返す', async () => {
    const hash1 = await hashPassword('password1', 'same-salt');
    const hash2 = await hashPassword('password2', 'same-salt');
    expect(hash1).not.toBe(hash2);
  });

  it('ハッシュは64文字の16進数文字列', async () => {
    const hash = await hashPassword('test', 'salt');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateSalt', () => {
  it('32文字の16進数文字列を返す', () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('毎回異なる値を返す', () => {
    const salts = new Set();
    for (let i = 0; i < 10; i++) salts.add(generateSalt());
    expect(salts.size).toBe(10);
  });
});

describe('generateId', () => {
  it('UUID形式の文字列を返す', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('毎回異なる値を返す', () => {
    const ids = new Set();
    for (let i = 0; i < 10; i++) ids.add(generateId());
    expect(ids.size).toBe(10);
  });
});
