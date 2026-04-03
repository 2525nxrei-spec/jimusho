/**
 * DELETE /api/auth/account — アカウント削除
 */

import { errorResponse, jsonResponse } from '../../lib/response.js';
import { authenticateUser } from '../../lib/auth.js';
import { hashPassword } from '../../lib/crypto.js';
import { stripeRequest } from '../../lib/stripe.js';

export async function onRequestDelete(context) {
  const { request, env } = context;

  const user = await authenticateUser(request, env);
  if (!user) return errorResponse('認証が必要です', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('リクエストボディが不正です');
  }

  const { password } = body;
  if (!password) return errorResponse('パスワードの入力が必要です');

  // パスワード検証
  const dbUser = await env.DB.prepare(
    'SELECT password_hash, password_salt, stripe_customer_id FROM users WHERE id = ?'
  ).bind(user.id).first();

  if (!dbUser) return errorResponse('ユーザーが見つかりません', 404);

  const hash = await hashPassword(password, dbUser.password_salt);
  if (hash !== dbUser.password_hash) {
    return errorResponse('パスワードが正しくありません', 401);
  }

  // Stripeサブスクリプションのキャンセル（存在する場合）
  if (dbUser.stripe_customer_id && env.STRIPE_SECRET_KEY) {
    try {
      const subsData = await stripeRequest(
        `subscriptions?customer=${dbUser.stripe_customer_id}&status=active&limit=10`,
        'GET',
        null,
        env.STRIPE_SECRET_KEY
      );

      // アクティブなサブスクリプションをすべて即時キャンセル
      if (subsData.data && subsData.data.length > 0) {
        for (const sub of subsData.data) {
          await stripeRequest(
            `subscriptions/${sub.id}`,
            'DELETE',
            null,
            env.STRIPE_SECRET_KEY
          );
          console.log(`Stripeサブスク即時キャンセル: user=${user.id}, subscription=${sub.id}`);
        }
      }
    } catch (err) {
      console.error('Stripeサブスクキャンセルエラー:', err.message);
      return errorResponse('サブスクリプションの解約に失敗しました。アカウント削除を中断します', 500);
    }
  }

  // アカウント削除
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();

  return jsonResponse({ message: 'アカウントを削除しました。ご利用ありがとうございました。' });
}
