/**
 * functions/lib/crypto.js のテスト
 * Web Crypto APIが必要なため、Node 20のglobalThis.cryptoを使用
 */
import { describe, it, expect } from 'vitest';
import { hashPassword, generateSalt, generateId, createJWT, verifyJWT } from '../functions/lib/crypto.js';

describe('crypto.js', () => {
  describe('generateSalt', () => {
    it('32文字のhex文字列を生成する', () => {
      const salt = generateSalt();
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
    });

    it('毎回異なる値を生成する', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('generateId', () => {
    it('UUID形式の文字列を生成する', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('hashPassword', () => {
    it('同じ入力に対して同じハッシュを返す', async () => {
      const salt = 'test-salt-value';
      const hash1 = await hashPassword('password123', salt);
      const hash2 = await hashPassword('password123', salt);
      expect(hash1).toBe(hash2);
    });

    it('異なるパスワードに対して異なるハッシュを返す', async () => {
      const salt = 'test-salt-value';
      const hash1 = await hashPassword('password123', salt);
      const hash2 = await hashPassword('password456', salt);
      expect(hash1).not.toBe(hash2);
    });

    it('異なるソルトに対して異なるハッシュを返す', async () => {
      const hash1 = await hashPassword('password123', 'salt-a');
      const hash2 = await hashPassword('password123', 'salt-b');
      expect(hash1).not.toBe(hash2);
    });

    it('64文字のhex文字列を返す（SHA-256 = 256bit = 32bytes = 64hex）', async () => {
      const hash = await hashPassword('test', 'salt');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('createJWT / verifyJWT', () => {
    const secret = 'my-super-secret';

    it('有効なJWTを作成・検証できる', async () => {
      const payload = { sub: 'user-123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = await createJWT(payload, secret);

      // JWT形式: header.payload.signature
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      const verified = await verifyJWT(token, secret);
      expect(verified).not.toBeNull();
      expect(verified.sub).toBe('user-123');
      expect(verified.email).toBe('test@example.com');
    });

    it('異なるシークレットで検証すると失敗する', async () => {
      const payload = { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = await createJWT(payload, secret);
      const verified = await verifyJWT(token, 'wrong-secret');
      expect(verified).toBeNull();
    });

    it('期限切れのトークンはnullを返す', async () => {
      const payload = { sub: 'user-123', exp: Math.floor(Date.now() / 1000) - 100 };
      const token = await createJWT(payload, secret);
      const verified = await verifyJWT(token, secret);
      expect(verified).toBeNull();
    });

    it('不正な形式のトークンはnullを返す', async () => {
      expect(await verifyJWT('invalid-token', secret)).toBeNull();
      expect(await verifyJWT('a.b', secret)).toBeNull();
      expect(await verifyJWT('', secret)).toBeNull();
    });
  });
});
