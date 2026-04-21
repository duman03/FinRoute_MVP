CREATE TYPE transaction_type   AS ENUM ('BUY', 'SELL');
CREATE TYPE transaction_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE transactions (
    id                  UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id        UUID               NOT NULL,
    user_id             UUID               NOT NULL,
    symbol              VARCHAR(20)        NOT NULL,
    type                transaction_type   NOT NULL,
    quantity            NUMERIC(18,8)      NOT NULL,
    price_at_execution  NUMERIC(18,4)      NOT NULL,
    price_source_ts     TIMESTAMPTZ        NOT NULL,
    total_amount        NUMERIC(18,4)      NOT NULL
        GENERATED ALWAYS AS (quantity * price_at_execution) STORED,
    status              transaction_status NOT NULL DEFAULT 'PENDING',
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_transactions_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_quantity   CHECK (quantity > 0),
    CONSTRAINT chk_price      CHECK (price_at_execution > 0)
);

CREATE INDEX idx_transactions_portfolio_id ON transactions (portfolio_id, created_at DESC);
CREATE INDEX idx_transactions_user_id ON transactions (user_id, created_at DESC);
CREATE INDEX idx_transactions_symbol ON transactions (symbol);

COMMENT ON COLUMN transactions.price_at_execution IS
    'M-01: İşlem anındaki Redis cache fiyatı. P&L denetim izi için saklanır.';
COMMENT ON COLUMN transactions.price_source_ts IS
    'M-01: Fiyatın Finnhub/Redis kaynaklı zaman damgası. Stale fiyat tespiti için.';
