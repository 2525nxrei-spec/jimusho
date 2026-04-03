/**
 * POST /api/auth/login — ログイン
 */

import { errorResponse, jsonResponse } from '../../lib/response.js';
import { hashPassword, createJWT } from '../../lib/crypto.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) return errorResponse('メールアドレスとパスワードを入力してください');

    const emailLower = email.toLowerCase().trim();
    const user = await env.DB
      .prepare('SELECT id, email, display_name, password_hash, password_salt, plan, failed_attempts, locked_until FROM users WHERE email = ?')
      .bind(emailLower)
      .first();
    if (!user) return errorResponse('メールアドレスまたはパスワードが正しくありません', 401);

    // アカウントロック判定（5回失敗で15分ロック）
    const MAX_ATTEMPTS = 5;
    const LOCK_DURATION_MIN = 15;
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until + 'Z').getTime();
      if (Date.now() < lockedUntil) {
        const remainMin = Math.ceil((lockedUntil - Date.now()) / 60000);
        return errorResponse(`アカウントがロックされています。${remainMin}分後にお試しください`, 429);
      }
      // ロック期間終了 → カウントリセット
      await env.DB.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
      user.failed_attempts = 0;
    }

    const hash = await hashPassword(password, user.password_salt);
    if (hash !== user.password_hash) {
      // 失敗カウントを増加
      const attempts = (user.failed_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        // ロック設定
        await env.DB.prepare(
          "UPDATE users SET failed_attempts = ?, locked_until = datetime('now', '+' || ? || ' minutes') WHERE id = ?"
        ).bind(attempts, LOCK_DURATION_MIN, user.id).run();
        return errorResponse(`ログイン試行回数の上限に達しました。${LOCK_DURATION_MIN}分後にお試しください`, 429);
      }
      await env.DB.prepare("UPDATE users SET failed_attempts = ? WHERE id = ?").bind(attempts, user.id).run();
      return errorResponse('メールアドレスまたはパスワードが正しくありません', 401);
    }

    // ログイン成功 → 失敗カウントリセット
    if (user.failed_attempts > 0) {
      await env.DB.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
    }

    const token = await createJWT(
      { sub: user.id, email: user.email, plan: user.plan, exp: Math.floor(Date.now() / 1000) + 30 * 86400 },
      env.JWT_SECRET
    );

    return jsonResponse({
      token,
      user: { id: user.id, email: user.email, display_name: user.display_name, plan: user.plan },
    });
  } catch (err) {
    console.error('ログインエラー:', err.message);
    return errorResponse('ログイン処理中にエラーが発生しました', 500);
  }
}
