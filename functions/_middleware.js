/**
 * グローバルミドルウェア — CORS処理 + セキュリティヘッダー + レート制限 + Proツールガード
 * Webhook以外の全APIレスポンスにCORSヘッダーを付与
 * Proツールページへの直接アクセスをサーバーサイドでブロック
 */

import { verifyJWT } from './lib/crypto.js';

// 許可するオリジン（本番 + ローカル開発）
const ALLOWED_ORIGINS = [
  'https://jimusho-tool.com',
  'http://localhost:8788',
];

// Proツール一覧（auth.jsのPRO_TOOLSと同期）
const PRO_TOOL_PATHS = [
  '/tools/invoice-generator/',
  '/tools/delivery-note/',
  '/tools/receipt-generator/',
  '/tools/estimate-generator/',
  '/tools/expense-memo/',
  '/tools/revenue-tracker/',
  '/tools/take-home-pay/',
  '/tools/sales-email/',
  '/tools/work-log/',
];

function addCORSHeaders(response, origin) {
  const headers = new Headers(response.headers);
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** セキュリティヘッダーを付与 */
function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** インメモリレート制限（IP+パスベース） */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_AUTH = 10;
const RATE_LIMIT_MAX_GENERAL = 120;

function isRateLimited(ip, pathname) {
  const now = Date.now();
  const isAuthEndpoint = pathname.includes('/api/auth/login') || pathname.includes('/api/auth/register');
  const limit = isAuthEndpoint ? RATE_LIMIT_MAX_AUTH : RATE_LIMIT_MAX_GENERAL;
  const key = isAuthEndpoint ? `auth:${ip}` : `gen:${ip}`;

  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
    }
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return addCORSHeaders(new Response(null, { status: 204 }), origin);
  }

  // Proツールガード: サーバーサイドでプラン検証（localStorageバイパス防止）
  const isProToolPath = PRO_TOOL_PATHS.some(p => url.pathname.startsWith(p));
  if (isProToolPath) {
    let authorized = false;
    try {
      const cookieHeader = request.headers.get('Cookie') || '';
      const authHeader = request.headers.get('Authorization') || '';
      let token = null;

      // Authorizationヘッダーから取得
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      // Cookieからtoolbox_tokenを取得（フォールバック）
      if (!token) {
        const match = cookieHeader.match(/toolbox_token=([^;]+)/);
        if (match) token = match[1];
      }

      if (token && env.JWT_SECRET) {
        const payload = await verifyJWT(token, env.JWT_SECRET);
        if (payload && payload.sub) {
          // DBからプランを直接確認（localStorageに依存しない）
          const user = await env.DB
            .prepare('SELECT plan FROM users WHERE id = ?')
            .bind(payload.sub)
            .first();
          if (user && user.plan === 'pro') {
            authorized = true;
          }
        }
      }
    } catch (e) {
      console.error('Proツールガード検証エラー:', e.message);
    }

    if (!authorized) {
      // HTMLリクエスト（ブラウザ直接アクセス）はリダイレクト
      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': '/pages/pricing.html?upgrade=1' },
        });
      }
      // APIリクエストは403 JSON
      return addSecurityHeaders(addCORSHeaders(
        new Response(JSON.stringify({ ok: false, error: 'Proプランが必要です' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
        origin
      ));
    }
  }

  // レート制限チェック（Webhookは除外）
  if (url.pathname !== '/api/stripe/webhook') {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(clientIP, url.pathname)) {
      return addSecurityHeaders(addCORSHeaders(
        new Response(JSON.stringify({ ok: false, error: 'リクエストが多すぎます。しばらく待ってからお試しください。' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
        origin
      ));
    }
  }

  // 定期クリーンアップ
  if (Math.random() < 0.01) cleanupRateLimit();

  // 次のハンドラを実行
  const response = await context.next();

  // Webhookはストライプから直接呼ばれるのでCORS不要
  if (url.pathname === '/api/stripe/webhook') {
    return addSecurityHeaders(response);
  }

  return addSecurityHeaders(addCORSHeaders(response, origin));
}
