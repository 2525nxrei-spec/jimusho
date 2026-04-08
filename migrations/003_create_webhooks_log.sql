-- TB-021: webhooks_logテーブル作成（Webhook冪等性チェック＋ログ記録用）
-- 実行コマンド: wrangler d1 execute toolbox-db --file=migrations/003_create_webhooks_log.sql --remote

CREATE TABLE IF NOT EXISTS webhooks_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  payload TEXT,
  processed_at TEXT NOT NULL
);

-- 冪等性チェック用インデックス
CREATE INDEX IF NOT EXISTS idx_webhooks_log_stripe_event_id ON webhooks_log(stripe_event_id);

-- クリーンアップ用インデックス
CREATE INDEX IF NOT EXISTS idx_webhooks_log_processed_at ON webhooks_log(processed_at);
