/**
 * 認証ミドルウェア — JWTからユーザーを取得
 */

import { verifyJWT } from './crypto.js';

export async function authenticateUser(request, env) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    if (!env.JWT_SECRET) return null;
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload || !payload.sub) return null;
    if (!env.DB) return null;
    const user = await env.DB
      .prepare('SELECT id, email, display_name, plan, stripe_customer_id, stripe_subscription_id FROM users WHERE id = ?')
      .bind(payload.sub)
      .first();
    return user || null;
  } catch (err) {
    console.error('認証エラー:', err.message);
    return null;
  }
}
