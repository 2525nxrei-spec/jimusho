/**
 * グローバルミドルウェア — CORS処理
 * Webhook以外の全APIレスポンスにCORSヘッダーを付与
 */

// 許可するオリジン（本番 + ローカル開発）
const ALLOWED_ORIGINS = [
  'https://jimusho-tool.com',
  'http://localhost:8788',
];

function addCORSHeaders(response, origin) {
  const headers = new Headers(response.headers);
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return addCORSHeaders(new Response(null, { status: 204 }), origin);
  }

  // 次のハンドラを実行
  const response = await context.next();

  // Webhookはストライプから直接呼ばれるのでCORS不要
  if (url.pathname === '/api/stripe/webhook') {
    return response;
  }

  return addCORSHeaders(response, origin);
}
