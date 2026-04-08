/**
 * POST /api/stripe/webhook — Stripe Webhook処理
 * 注意: CORSはミドルウェアでスキップされる（Stripeから直接呼ばれるため）
 *
 * 処理フロー:
 * 1. ペイロード取得・署名検証
 * 2. 冪等性チェック（webhooks_logテーブル）
 * 3. イベントタイプ別DB更新（個別try-catchで失敗を隔離）
 * 4. ログ記録
 * 5. 200応答（Stripeに不要なリトライをさせない）
 */

import { errorResponse, jsonResponse } from '../../lib/response.js';
import { generateId } from '../../lib/crypto.js';
import { verifyStripeSignature } from '../../lib/stripe.js';

/**
 * イベント処理ヘルパー: DB更新をtry-catchで囲み、失敗してもWebhook全体を500にしない
 * @param {string} label - ログ用ラベル
 * @param {Function} fn - async実行関数
 * @returns {boolean} 成功したかどうか
 */
async function safeProcess(label, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`[${label}] DB更新エラー:`, err.message);
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // --- 1. ペイロード取得・環境変数チェック ---
    const payload = await request.text();
    const signatureHeader = request.headers.get('stripe-signature');

    if (!env.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRETが未設定');
      return errorResponse('Webhook設定エラー', 500);
    }

    if (!env.DB) {
      console.error('D1データベースが未バインド');
      return errorResponse('データベース未設定', 500);
    }

    // --- 2. 署名検証 ---
    let event;
    try {
      event = await verifyStripeSignature(payload, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
    } catch (verifyErr) {
      console.error('Webhook署名検証失敗:', verifyErr.message);
      return errorResponse('署名検証失敗', 400);
    }

    // --- 3. 冪等性チェック ---
    try {
      const existing = await env.DB
        .prepare('SELECT id FROM webhooks_log WHERE stripe_event_id = ?')
        .bind(event.id)
        .first();
      if (existing) {
        console.log(`Webhook冪等性: ${event.id} は処理済み`);
        return jsonResponse({ received: true });
      }
    } catch (dbErr) {
      // webhooks_logテーブルが存在しない場合でも処理は続行
      // （テーブル未作成時にWebhook全体が止まるのを防止）
      console.error('冪等性チェックエラー（処理は続行）:', dbErr.message);
    }

    console.log(`Webhook受信: type=${event.type}, id=${event.id}`);

    // --- 4. イベント処理（各イベントは個別エラーハンドリング） ---
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        if (!userId) {
          console.error('checkout.session.completed: metadata.user_idが未設定');
          break;
        }
        await safeProcess('checkout.session.completed', async () => {
          await env.DB.prepare(
            `UPDATE users SET plan = 'pro', cancel_at_period_end = 0,
             stripe_customer_id = COALESCE(stripe_customer_id, ?),
             stripe_subscription_id = ?, updated_at = datetime('now')
             WHERE id = ?`
          ).bind(customerId, subscriptionId, userId).run();
          console.log(`Pro開始: user=${userId}, customer=${customerId}, subscription=${subscriptionId}`);
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'active' || sub.status === 'trialing') {
          await safeProcess('subscription.updated(active)', async () => {
            await env.DB.prepare(
              `UPDATE users SET plan = 'pro', cancel_at_period_end = ?,
               stripe_subscription_id = ?, updated_at = datetime('now')
               WHERE stripe_customer_id = ?`
            ).bind(sub.cancel_at_period_end ? 1 : 0, sub.id, sub.customer).run();
            console.log(`Pro更新: customer=${sub.customer}, cancel_at_period_end=${sub.cancel_at_period_end}`);
          });
        } else if (sub.status === 'past_due' || sub.status === 'unpaid' || sub.status === 'canceled') {
          await safeProcess(`subscription.updated(${sub.status})`, async () => {
            await env.DB.prepare(
              `UPDATE users SET plan = 'free', cancel_at_period_end = 0, updated_at = datetime('now')
               WHERE stripe_customer_id = ?`
            ).bind(sub.customer).run();
            console.log(`ダウングレード(${sub.status}): customer=${sub.customer}`);
          });
        } else {
          console.log(`subscription.updated: 未処理ステータス=${sub.status}, customer=${sub.customer}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await safeProcess('subscription.deleted', async () => {
          await env.DB.prepare(
            `UPDATE users SET plan = 'free', stripe_subscription_id = NULL,
             cancel_at_period_end = 0, updated_at = datetime('now')
             WHERE stripe_customer_id = ?`
          ).bind(sub.customer).run();
          console.log(`解約完了: customer=${sub.customer}`);
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;
        const amountPaid = invoice.amount_paid;

        await safeProcess('invoice.payment_succeeded', async () => {
          await env.DB.prepare(
            `UPDATE users SET updated_at = datetime('now') WHERE stripe_customer_id = ?`
          ).bind(customerId).run();
          console.log(`支払い成功: customer=${customerId}, subscription=${subscriptionId}, amount=${amountPaid}円`);
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const attemptCount = invoice.attempt_count;

        await safeProcess('invoice.payment_failed', async () => {
          await env.DB.prepare(
            `UPDATE users SET updated_at = datetime('now') WHERE stripe_customer_id = ?`
          ).bind(customerId).run();
        });
        console.error(`支払い失敗: customer=${customerId}, 試行=${attemptCount}`);
        break;
      }

      default:
        console.log(`未対応イベント: ${event.type}`);
    }

    // --- 5. Webhookログ記録 ---
    try {
      await env.DB.prepare(
        `INSERT INTO webhooks_log (id, event_type, stripe_event_id, payload, processed_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(generateId(), event.type, event.id, JSON.stringify(event)).run();
    } catch (logErr) {
      // UNIQUEエラーは冪等性の重複なので無視、それ以外はログ
      if (!logErr.message?.includes('UNIQUE')) {
        console.error('Webhookログ記録エラー:', logErr.message);
      }
    }

    // --- 6. 古いログの定期クリーンアップ（5%の確率） ---
    if (Math.random() < 0.05) {
      try {
        await env.DB.prepare(
          "DELETE FROM webhooks_log WHERE processed_at < datetime('now', '-90 days')"
        ).run();
      } catch (cleanupErr) {
        console.error('Webhookログクリーンアップエラー:', cleanupErr.message);
      }
    }

    // Stripeには常に200を返す（署名検証成功後は500を返さない）
    return jsonResponse({ received: true });
  } catch (err) {
    console.error('Webhook致命的エラー:', err.message, err.stack);
    return errorResponse('Webhook処理エラー', 500);
  }
}
