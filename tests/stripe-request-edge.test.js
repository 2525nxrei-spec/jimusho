/**
 * stripeRequest関数の追加エッジケーステスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripeRequest } from '../functions/lib/stripe.js';

describe('stripeRequest — 追加エッジケース', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bodyなしのPOSTリクエストはbodyを送信しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'obj_1' }),
    }));

    await stripeRequest('test_endpoint', 'POST', null, 'sk_test');
    const callArgs = fetch.mock.calls[0];
    expect(callArgs[1].body).toBeUndefined();
  });

  it('ネストされたオブジェクトをフォームボディに正しく変換する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'obj_2' }),
    }));

    await stripeRequest('customers', 'POST', {
      email: 'test@example.com',
      metadata: { key1: 'value1', key2: 'value2' },
    }, 'sk_test');

    const callArgs = fetch.mock.calls[0];
    const body = callArgs[1].body;
    expect(body).toContain('email=test%40example.com');
    expect(body).toContain('metadata%5Bkey1%5D=value1');
    expect(body).toContain('metadata%5Bkey2%5D=value2');
  });

  it('配列パラメータを正しく変換する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'obj_3' }),
    }));

    await stripeRequest('test', 'POST', {
      items: ['a', 'b', 'c'],
    }, 'sk_test');

    const callArgs = fetch.mock.calls[0];
    const body = callArgs[1].body;
    expect(body).toContain('items%5B0%5D=a');
    expect(body).toContain('items%5B1%5D=b');
    expect(body).toContain('items%5B2%5D=c');
  });

  it('null/undefined値はフォームボディから除外される', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'obj_4' }),
    }));

    await stripeRequest('test', 'POST', {
      name: 'test',
      description: null,
      note: undefined,
    }, 'sk_test');

    const callArgs = fetch.mock.calls[0];
    const body = callArgs[1].body;
    expect(body).toContain('name=test');
    expect(body).not.toContain('description');
    expect(body).not.toContain('note');
  });

  it('GETリクエストでbodyがnullの場合はクエリパラメータなし', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'sub_1' }),
    }));

    await stripeRequest('subscriptions/sub_1', 'GET', null, 'sk_test');
    const callArgs = fetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.stripe.com/v1/subscriptions/sub_1');
    expect(callArgs[0]).not.toContain('?');
  });

  it('配列内のオブジェクトも正しくフラット化される', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id: 'obj_5' }),
    }));

    await stripeRequest('test', 'POST', {
      items: [{ price: 'price_1', quantity: 1 }],
    }, 'sk_test');

    const callArgs = fetch.mock.calls[0];
    const body = callArgs[1].body;
    expect(body).toContain('items%5B0%5D%5Bprice%5D=price_1');
    expect(body).toContain('items%5B0%5D%5Bquantity%5D=1');
  });
});
