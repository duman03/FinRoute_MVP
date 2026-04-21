-- 012_add_sequence_number.sql
-- N-02: İşlem sıra numarası — strict ordering garantisi
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS sequence_number BIGINT;

-- Portfolio bazında benzersiz sıra numarası
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_portfolio_seq
    ON transactions (portfolio_id, sequence_number)
    WHERE sequence_number IS NOT NULL;

-- PENDING durumundaki işlemleri hızlı bulmak için (CRON-3 reaper)
CREATE INDEX IF NOT EXISTS idx_transactions_pending_stale
    ON transactions (status, created_at)
    WHERE status = 'PENDING';
