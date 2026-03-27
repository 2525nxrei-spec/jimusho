/**
 * functions/api/stripe/stripe-key.js のテスト
 */
import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../functions/api/stripe/stripe-key.js';

describe('GET /api/stripe/stripe-key', () => {
  it('公開鍵が設定されている場合はキーを返す', async () => {
    const context = { env: { STRIPE_PUBLISHABLE_KEY: 'pk_test_abc123' } };
    const res = await onRequestGet(context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.publishableKey).toBe('pk_test_abc123');
  });

  it('公開鍵が未設定の場合は500を返す', async () => {
    const context = { env: { STRIPE_PUBLISHABLE_KEY: '' } };
    const res = await onRequestGet(context);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('公開鍵');
  });
});
