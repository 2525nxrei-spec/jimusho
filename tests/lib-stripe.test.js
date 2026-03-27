/**
 * functions/lib/stripe.js のテスト
 * 外部API呼び出し（stripeRequest）はfetchモックを使用
 * verifyStripeSignature は署名計算ロジックをテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripeRequest, verifyStripeSignature } from '../functions/lib/stripe.js';

describe('stripe.js', () => {
  describe('stripeRequest', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('正常なレスポンスを返す（fetchモック）', async () => {
      const mockData = { id: 'cus_test', email: 'test@example.com' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockData),
      }));

      const result = await stripeRequest('customers', 'POST', { email: 'test@example.com' }, 'sk_test_key');
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledOnce();

      // fetchに渡されたURLを確認
      const callArgs = fetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.stripe.com/v1/customers');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers['Authorization']).toBe('Bearer sk_test_key');
    });

    it('GETリクエストではbodyをクエリパラメータに変換する', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ id: 'sub_123' }),
      }));

      await stripeRequest('subscriptions/sub_123', 'GET', { expand: 'data' }, 'sk_test_key');
      const callArgs = fetch.mock.calls[0];
      expect(callArgs[0]).toContain('?');
      expect(callArgs[1].method).toBe('GET');
    });

    it('Stripe APIエラー時に例外をスローする', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      }));

      await expect(stripeRequest('customers', 'GET', null, 'bad_key'))
        .rejects.toThrow('Invalid API key');
    });

    it('エラーメッセージがない場合はデフォルトメッセージをスローする', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: {} }),
      }));

      await expect(stripeRequest('customers', 'GET', null, 'bad_key'))
        .rejects.toThrow('Stripe APIエラー');
    });
  });

  describe('verifyStripeSignature', () => {
    it('signatureヘッダーがない場合はエラーをスローする', async () => {
      await expect(verifyStripeSignature('{}', null, 'whsec_test'))
        .rejects.toThrow('Stripe-Signatureヘッダーがありません');
    });

    it('形式が不正なsignatureヘッダーはエラーをスローする', async () => {
      await expect(verifyStripeSignature('{}', 'invalid-header', 'whsec_test'))
        .rejects.toThrow('Stripe-Signatureヘッダーの形式が不正です');
    });

    it('タイムスタンプが古すぎる場合はエラーをスローする', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10分前
      const header = `t=${oldTimestamp},v1=dummysig`;
      await expect(verifyStripeSignature('{}', header, 'whsec_test'))
        .rejects.toThrow('Webhookタイムスタンプが許容範囲外です');
    });

    it('正しい署名でイベントを検証・パースできる', async () => {
      const payload = '{"id":"evt_test","type":"checkout.session.completed"}';
      const secret = 'whsec_test_secret';
      const timestamp = Math.floor(Date.now() / 1000);

      // 正しい署名を計算
      const signedPayload = `${timestamp}.${payload}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const header = `t=${timestamp},v1=${signature}`;
      const event = await verifyStripeSignature(payload, header, secret);
      expect(event.id).toBe('evt_test');
      expect(event.type).toBe('checkout.session.completed');
    });

    it('不正な署名ではエラーをスローする', async () => {
      const payload = '{"id":"evt_test"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const header = `t=${timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000`;

      await expect(verifyStripeSignature(payload, header, 'whsec_test'))
        .rejects.toThrow('Webhook署名の検証に失敗しました');
    });
  });
});
