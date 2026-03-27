/**
 * Stripe署名検証の異常系・エッジケース重点テスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyStripeSignature } from '../functions/lib/stripe.js';

describe('verifyStripeSignature — エッジケース', () => {
  it('空文字列のsignatureヘッダーはエラーをスローする', async () => {
    await expect(verifyStripeSignature('{}', '', 'whsec_test'))
      .rejects.toThrow('Stripe-Signatureヘッダーがありません');
  });

  it('undefinedのsignatureヘッダーはエラーをスローする', async () => {
    await expect(verifyStripeSignature('{}', undefined, 'whsec_test'))
      .rejects.toThrow('Stripe-Signatureヘッダーがありません');
  });

  it('タイムスタンプのみでv1署名がない場合はエラーをスローする', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyStripeSignature('{}', `t=${now}`, 'whsec_test'))
      .rejects.toThrow('Stripe-Signatureヘッダーの形式が不正です');
  });

  it('v1署名のみでタイムスタンプがない場合はエラーをスローする', async () => {
    await expect(verifyStripeSignature('{}', 'v1=abcdef1234567890', 'whsec_test'))
      .rejects.toThrow('Stripe-Signatureヘッダーの形式が不正です');
  });

  it('未来すぎるタイムスタンプ（+600秒）はエラーをスローする', async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
    const header = `t=${futureTimestamp},v1=dummysig`;
    await expect(verifyStripeSignature('{}', header, 'whsec_test'))
      .rejects.toThrow('Webhookタイムスタンプが許容範囲外です');
  });

  it('複数のv1署名がある場合、1つでも正しければ検証成功する', async () => {
    const payload = '{"id":"evt_multi","type":"test"}';
    const secret = 'whsec_multi_test';
    const timestamp = Math.floor(Date.now() / 1000);

    // 正しい署名を計算
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const correctSig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // 不正な署名 + 正しい署名
    const header = `t=${timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000,v1=${correctSig}`;
    const event = await verifyStripeSignature(payload, header, secret);
    expect(event.id).toBe('evt_multi');
  });

  it('ペイロードが不正なJSONの場合はエラーをスローする', async () => {
    const payload = 'not-valid-json';
    const secret = 'whsec_test';
    const timestamp = Math.floor(Date.now() / 1000);

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const sig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const header = `t=${timestamp},v1=${sig}`;
    await expect(verifyStripeSignature(payload, header, secret))
      .rejects.toThrow();
  });

  it('署名の長さが異なる場合は検証失敗する', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=short`;
    await expect(verifyStripeSignature('{"id":"evt_1"}', header, 'whsec_test'))
      .rejects.toThrow('Webhook署名の検証に失敗しました');
  });
});
