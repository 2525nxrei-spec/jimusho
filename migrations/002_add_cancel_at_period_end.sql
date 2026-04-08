-- TB-020: cancel_at_period_endカラム追加（Webhook処理で必要）
-- 実行コマンド: wrangler d1 execute toolbox-db --file=migrations/002_add_cancel_at_period_end.sql --remote

ALTER TABLE users ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0;
