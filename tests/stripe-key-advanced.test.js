/**
 * Stripe公開鍵API追加テスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../functions/api/stripe/stripe-key.js';

describe('GET /api/stripe/stripe-key — 詳細テスト', () => {
  it('正常に公開鍵を返す場合はokがtrue', async () => {
    const ctx = { env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_abc123' } };
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.publishableKey).toBe('pk_test_abc123');
  });

  it('公開鍵がundefinedの場合は500を返す', async () => {
    const ctx = { env: {} };
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('公開鍵');
  });

  it('公開鍵が空文字の場合は500を返す', async () => {
    const ctx = { env: { STRIPE_PUBLISHABLE_KEY: '' } };
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(500);
  });

  it('レスポンスのContent-TypeがJSON', async () => {
    const ctx = { env: { STRIPE_PUBLISHABLE_KEY: 'pk_live_xyz' } };
    const res = await onRequestGet(ctx);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
