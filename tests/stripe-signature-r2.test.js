/**
 * テスト強化第2ラウンド: Stripe署名検証 — 追加異常系
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyStripeSignature } from '../functions/lib/stripe.js';

describe('verifyStripeSignature R2 — タイムスタンプ境界値', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('ちょうど300秒前のタイムスタンプは検証成功する', async () => {
    const payload = '{"id":"evt_boundary","type":"test"}';
    const secret = 'whsec_boundary_test';
    // 300秒前 = ギリギリ許容範囲内
    const timestamp = Math.floor(Date.now() / 1000) - 300;
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const sig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const header = `t=${timestamp},v1=${sig}`;
    const event = await verifyStripeSignature(payload, header, secret);
    expect(event.id).toBe('evt_boundary');
  });

  it('301秒前のタイムスタンプは許容範囲外でエラー', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 301;
    const header = `t=${timestamp},v1=dummysig`;
    await expect(verifyStripeSignature('{}', header, 'whsec_test'))
      .rejects.toThrow('Webhookタイムスタンプが許容範囲外です');
  });

  it('ちょうど300秒未来のタイムスタンプは検証成功する', async () => {
    const payload = '{"id":"evt_future_boundary","type":"test"}';
    const secret = 'whsec_future_test';
    const timestamp = Math.floor(Date.now() / 1000) + 300;
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const sig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const header = `t=${timestamp},v1=${sig}`;
    const event = await verifyStripeSignature(payload, header, secret);
    expect(event.id).toBe('evt_future_boundary');
  });

  it('301秒未来のタイムスタンプは許容範囲外でエラー', async () => {
    const timestamp = Math.floor(Date.now() / 1000) + 301;
    const header = `t=${timestamp},v1=dummysig`;
    await expect(verifyStripeSignature('{}', header, 'whsec_test'))
      .rejects.toThrow('Webhookタイムスタンプが許容範囲外です');
  });
});

describe('verifyStripeSignature R2 — 不正ヘッダー形式', () => {
  it('カンマなしの文字列はエラー', async () => {
    await expect(verifyStripeSignature('{}', 'invalid_header_no_comma', 'whsec_test'))
      .rejects.toThrow();
  });

  it('t=のみ値なしはエラー', async () => {
    await expect(verifyStripeSignature('{}', 't=,v1=abc', 'whsec_test'))
      .rejects.toThrow();
  });

  it('t=NaNはエラー', async () => {
    await expect(verifyStripeSignature('{}', 't=notanumber,v1=abc', 'whsec_test'))
      .rejects.toThrow();
  });

  it('v0スキーム（非v1）のみはエラー', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyStripeSignature('{}', `t=${now},v0=abc`, 'whsec_test'))
      .rejects.toThrow('Stripe-Signatureヘッダーの形式が不正です');
  });

  it('空のv1値は署名不一致でエラー', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyStripeSignature('{}', `t=${now},v1=`, 'whsec_test'))
      .rejects.toThrow('Webhook署名の検証に失敗しました');
  });
});

describe('verifyStripeSignature R2 — 秘密鍵が異なる', () => {
  it('異なる秘密鍵で署名検証失敗する', async () => {
    const payload = '{"id":"evt_wrong_key","type":"test"}';
    const correctSecret = 'whsec_correct';
    const wrongSecret = 'whsec_wrong';
    const timestamp = Math.floor(Date.now() / 1000);

    // correctSecretで署名を作成
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(correctSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const sig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const header = `t=${timestamp},v1=${sig}`;
    // wrongSecretで検証 → 失敗
    await expect(verifyStripeSignature(payload, header, wrongSecret))
      .rejects.toThrow('Webhook署名の検証に失敗しました');
  });
});

describe('verifyStripeSignature R2 — 特殊なペイロード', () => {
  it('日本語を含むJSONペイロードも正常に検証できる', async () => {
    const payload = '{"id":"evt_jp","type":"test","data":{"msg":"日本語テスト"}}';
    const secret = 'whsec_jp_test';
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
    const event = await verifyStripeSignature(payload, header, secret);
    expect(event.id).toBe('evt_jp');
    expect(event.data.msg).toBe('日本語テスト');
  });

  it('改行を含むペイロードも正常に検証できる', async () => {
    const payload = '{"id":"evt_newline","type":"test","data":{"note":"line1\\nline2"}}';
    const secret = 'whsec_newline_test';
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
    const event = await verifyStripeSignature(payload, header, secret);
    expect(event.id).toBe('evt_newline');
  });
});
