/**
 * POST /api/stripe/webhook — Stripe Webhook処理
 * 注意: CORSはミドルウェアでスキップされる（Stripeから直接呼ばれるため）
 */

import { errorResponse, jsonResponse } from '../../lib/response.js';
import { generateId } from '../../lib/crypto.js';
import { verifyStripeSignature } from '../../lib/stripe.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.text();
    const signatureHeader = request.headers.get('stripe-signature');
    if (!env.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRETが未設定');
      return errorResponse('Webhook設定エラー', 500);
    }

    let event;
    try {
      event = await verifyStripeSignature(payload, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
    } catch (verifyErr) {
      console.error('Webhook署名検証失敗:', verifyErr.message);
      return errorResponse('署名検証失敗', 400);
    }

    // 冪等性チェック
    const existing = await env.DB
      .prepare('SELECT id FROM webhooks_log WHERE stripe_event_id = ?')
      .bind(event.id)
      .first();
    if (existing) {
      console.log(`Webhook冪等性: ${event.id} は処理済み`);
      return jsonResponse({ received: true });
    }

    console.log(`Webhook受信: type=${event.type}, id=${event.id}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        if (userId) {
          await env.DB.prepare(
            `UPDATE users SET plan = 'pro', cancel_at_period_end = 0, stripe_customer_id = COALESCE(stripe_customer_id, ?),
             stripe_subscription_id = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(customerId, subscriptionId, userId).run();
          console.log(`Pro開始: user=${userId}`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'active' || sub.status === 'trialing') {
          await env.DB.prepare(
            `UPDATE users SET plan = 'pro', cancel_at_period_end = ?, stripe_subscription_id = ?, updated_at = datetime('now')
             WHERE stripe_customer_id = ?`
          ).bind(sub.cancel_at_period_end ? 1 : 0, sub.id, sub.customer).run();
        } else if (sub.status === 'past_due' || sub.status === 'unpaid' || sub.status === 'canceled') {
          // 支払い遅延・未払い・キャンセル: Proプランをfreeにダウングレード
          await env.DB.prepare(
            `UPDATE users SET plan = 'free', updated_at = datetime('now')
             WHERE stripe_customer_id = ?`
          ).bind(sub.customer).run();
          console.log(`ダウングレード(${sub.status}): customer=${sub.customer}`);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await env.DB.prepare(
          `UPDATE users SET plan = 'free', stripe_subscription_id = NULL, updated_at = datetime('now')
           WHERE stripe_customer_id = ?`
        ).bind(sub.customer).run();
        console.log(`解約: customer=${sub.customer}`);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;
        const amountPaid = invoice.amount_paid;

        await env.DB.prepare(
          `UPDATE users SET updated_at = datetime('now') WHERE stripe_customer_id = ?`
        ).bind(customerId).run();

        console.log(`支払い成功: customer=${customerId}, subscription=${subscriptionId}, amount=${amountPaid}円`);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const attemptCount = invoice.attempt_count;

        // 支払い失敗をログ記録し、updated_atを更新（ダウングレードはsubscription.updatedで処理）
        await env.DB.prepare(
          `UPDATE users SET updated_at = datetime('now') WHERE stripe_customer_id = ?`
        ).bind(customerId).run();

        console.error(`支払い失敗: customer=${customerId}, 試行=${attemptCount}`);
        break;
      }
      default:
        console.log(`未対応: ${event.type}`);
    }

    // Webhookログ記録
    try {
      await env.DB.prepare(
        `INSERT INTO webhooks_log (id, event_type, stripe_event_id, payload, processed_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(generateId(), event.type, event.id, JSON.stringify(event)).run();
    } catch (logErr) {
      if (!logErr.message?.includes('UNIQUE')) console.error('ログ記録エラー:', logErr.message);
    }

    // 古いWebhookログを削除（90日以上前、確率的に実行してDB負荷を分散）
    if (Math.random() < 0.05) {
      try {
        await env.DB.prepare(
          "DELETE FROM webhooks_log WHERE processed_at < datetime('now', '-90 days')"
        ).run();
      } catch (cleanupErr) {
        console.error('Webhookログクリーンアップエラー:', cleanupErr.message);
      }
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error('Webhookエラー:', err.message);
    return errorResponse('Webhook処理エラー', 500);
  }
}
