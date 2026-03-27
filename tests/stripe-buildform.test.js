/**
 * buildFormBody関数のテスト（stripeRequest内部で使用）
 * ネストされたオブジェクト、配列、null/undefinedフィルタリング
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripeRequest } from '../functions/lib/stripe.js';

describe('stripeRequest — リクエストボディのフォームエンコード', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('ネストされたオブジェクトが正しくフラット化される', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedBody = opts?.body || '';
      return new Response(JSON.stringify({ id: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('customers', 'POST', {
      email: 'test@example.com',
      metadata: { user_id: 'u1', plan: 'pro' },
    }, 'sk_test');

    expect(capturedBody).toContain('email=test%40example.com');
    expect(capturedBody).toContain('metadata%5Buser_id%5D=u1');
    expect(capturedBody).toContain('metadata%5Bplan%5D=pro');
  });

  it('配列が正しくフラット化される', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedBody = opts?.body || '';
      return new Response(JSON.stringify({ id: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('subscriptions', 'POST', {
      items: [{ price: 'price_1' }, { price: 'price_2' }],
    }, 'sk_test');

    expect(capturedBody).toContain('items%5B0%5D%5Bprice%5D=price_1');
    expect(capturedBody).toContain('items%5B1%5D%5Bprice%5D=price_2');
  });

  it('プリミティブ配列が正しくフラット化される', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedBody = opts?.body || '';
      return new Response(JSON.stringify({ id: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('test', 'POST', {
      expand: ['data.customer', 'data.subscription'],
    }, 'sk_test');

    expect(capturedBody).toContain('expand%5B0%5D=data.customer');
    expect(capturedBody).toContain('expand%5B1%5D=data.subscription');
  });

  it('null/undefinedのプロパティはスキップされる', async () => {
    let capturedBody = '';
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedBody = opts?.body || '';
      return new Response(JSON.stringify({ id: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('customers', 'POST', {
      email: 'test@example.com',
      name: null,
      phone: undefined,
      description: 'valid',
    }, 'sk_test');

    expect(capturedBody).toContain('email=');
    expect(capturedBody).toContain('description=valid');
    expect(capturedBody).not.toContain('name=');
    expect(capturedBody).not.toContain('phone=');
  });

  it('GETリクエストではbodyがクエリパラメータに変換される', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ id: 'sub_1', status: 'active' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('subscriptions/sub_1', 'GET', { expand: ['customer'] }, 'sk_test');
    expect(capturedUrl).toContain('?');
    expect(capturedUrl).toContain('expand');
  });

  it('bodyがnullのGETリクエストはクエリパラメータなし', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ id: 'sub_1' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('subscriptions/sub_1', 'GET', null, 'sk_test');
    expect(capturedUrl).not.toContain('?');
  });

  it('Authorizationヘッダーに正しいAPIキーが設定される', async () => {
    let capturedHeaders = {};
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedHeaders = opts?.headers || {};
      return new Response(JSON.stringify({ id: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await stripeRequest('customers', 'POST', { email: 'test@example.com' }, 'sk_test_my_key');
    expect(capturedHeaders.Authorization).toBe('Bearer sk_test_my_key');
    expect(capturedHeaders['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('空のオブジェクトbodyでもエラーにならない', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await stripeRequest('customers', 'POST', {}, 'sk_test');
    expect(result.id).toBe('test');
  });
});

describe('stripeRequest — fetch失敗', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('fetchがネットワークエラーを投げた場合は例外が伝播する', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network unreachable');
    });

    await expect(
      stripeRequest('customers', 'POST', { email: 'test@example.com' }, 'sk_test')
    ).rejects.toThrow('Network unreachable');
  });

  it('レスポンスが不正なJSONの場合は例外が伝播する', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('not json', { status: 200 });
    });

    await expect(
      stripeRequest('customers', 'POST', { email: 'test@example.com' }, 'sk_test')
    ).rejects.toThrow();
  });
});
