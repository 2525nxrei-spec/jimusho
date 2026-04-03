-- TB-019: ログイン試行回数のアカウントレベル制限用カラム追加
-- 実行コマンド: wrangler d1 execute toolbox-db --file=migrations/001_add_account_lock.sql --remote

ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT DEFAULT NULL;
