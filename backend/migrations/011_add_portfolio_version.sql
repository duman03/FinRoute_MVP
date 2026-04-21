-- 011_add_portfolio_version.sql
-- A-01: portfolios.version was missing from Hafta 1 migration
-- Also add users.balance_version for optimistic fallback
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_version INTEGER NOT NULL DEFAULT 0;

-- Additional indexes from Hafta 2 Kontrol audit
CREATE INDEX IF NOT EXISTS idx_transactions_status_pending
    ON transactions (portfolio_id, created_at DESC)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_transactions_symbol_type_date
    ON transactions (symbol, type, created_at DESC);
