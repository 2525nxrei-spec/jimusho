/**
 * POST /api/stripe/checkout — Stripe Checkout Session作成
 */

import { errorResponse, jsonResponse } from '../../lib/response.js';
import { authenticateUser } from '../../lib/auth.js';
import { stripeRequest } from '../../lib/stripe.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const user = await authenticateUser(request, env);
  if (!user) return errorResponse('認証が必要です', 401);

  try {
    // 環境変数の事前検証（502 Bad Gateway防止）
    if (!env.STRIPE_SECRET_KEY) {
      console.error('Checkoutエラー: STRIPE_SECRET_KEYが未設定');
      return errorResponse('決済サービスの設定が完了していません', 500);
    }
    const priceId = env.STRIPE_PRICE_PRO;
    if (!priceId) {
      console.error('Checkoutエラー: STRIPE_PRICE_PROが未設定');
      return errorResponse('Price IDが設定されていません', 500);
    }

    // D1テーブル存在確認（subscriptions/usersテーブルのDB接続テスト）
    if (!env.DB) {
      console.error('Checkoutエラー: D1データベースが未バインド');
      return errorResponse('データベース接続エラー', 500);
    }

    // Stripe顧客の確認/作成
    let stripeCustomerId = user.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripeRequest('customers', 'POST', {
        email: user.email,
        name: user.display_name || user.email,
        metadata: { toolbox_user_id: user.id },
      }, env.STRIPE_SECRET_KEY);
      stripeCustomerId = customer.id;
      await env.DB
        .prepare("UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(stripeCustomerId, user.id)
        .run();
    }

    // Embedded Checkout: ページ内埋め込み決済（リダイレクトなし）
    const frontendUrl = env.FRONTEND_URL || 'https://jimusho-tool.com';
    const session = await stripeRequest('checkout/sessions', 'POST', {
      mode: 'subscription',
      ui_mode: 'embedded',
      customer: stripeCustomerId,
      locale: 'ja',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      return_url: `${frontendUrl}/pages/account.html?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
    }, env.STRIPE_SECRET_KEY);

    console.log(`Checkout作成: session=${session.id}, user=${user.id}`);
    return jsonResponse({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Checkoutエラー:', err.message, err.stack);
    return errorResponse('決済セッションの作成に失敗しました', 500);
  }
}
