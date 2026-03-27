/**
 * テスト用ヘルパー — モック・ユーティリティ
 */

/**
 * D1データベースのモック
 * prepare().bind().first() / run() パターンを再現
 */
export function createMockDB(data = {}) {
  const store = { ...data };

  return {
    _store: store,
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...params) {
          this._params = params;
          return this;
        },
        async first() {
          // テスト用: storeからSQLに応じたデータを返す
          if (store._firstHandler) {
            return store._firstHandler(this._sql, this._params);
          }
          return store._firstResult || null;
        },
        async run() {
          if (store._runHandler) {
            return store._runHandler(this._sql, this._params);
          }
          return { success: true };
        },
        async all() {
          if (store._allHandler) {
            return store._allHandler(this._sql, this._params);
          }
          return { results: store._allResult || [] };
        },
      };
    },
  };
}

/**
 * テスト用のenv（環境変数 + DB）を作成
 */
export function createMockEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-jwt-secret-key-for-testing',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
    STRIPE_PRICE_PRO: 'price_test_dummy',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
    FRONTEND_URL: 'https://jimusho-tool.com',
    DB: createMockDB(),
    ...overrides,
  };
}

/**
 * Requestオブジェクトを作成
 */
export function createRequest(url, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const init = {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

/**
 * レスポンスをJSONとしてパース
 */
export async function parseResponse(response) {
  const json = await response.json();
  return { status: response.status, body: json };
}
