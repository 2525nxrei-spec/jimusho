/**
 * functions/lib/response.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { errorResponse, jsonResponse } from '../functions/lib/response.js';

describe('response.js', () => {
  describe('errorResponse', () => {
    it('デフォルトで400ステータスを返す', async () => {
      const res = errorResponse('テストエラー');
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe('テストエラー');
    });

    it('指定したステータスコードを返す', async () => {
      const res = errorResponse('認証エラー', 401);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe('認証エラー');
    });

    it('500エラーを返せる', async () => {
      const res = errorResponse('サーバーエラー', 500);
      expect(res.status).toBe(500);
    });

    it('Content-Typeがapplication/json; charset=utf-8', () => {
      const res = errorResponse('テスト');
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    });
  });

  describe('jsonResponse', () => {
    it('デフォルトで200ステータスを返す', async () => {
      const res = jsonResponse({ user: { id: '1' } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.user.id).toBe('1');
    });

    it('指定したステータスコードを返す', async () => {
      const res = jsonResponse({ created: true }, 201);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it('データがokプロパティとマージされる', async () => {
      const res = jsonResponse({ token: 'abc', user: { email: 'a@b.c' } });
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.token).toBe('abc');
      expect(json.user.email).toBe('a@b.c');
    });
  });
});
