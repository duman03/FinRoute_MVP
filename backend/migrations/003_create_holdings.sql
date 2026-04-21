CREATE TABLE holdings (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id     UUID        NOT NULL,
    user_id          UUID        NOT NULL,
    symbol           VARCHAR(20) NOT NULL,
    quantity         NUMERIC(18,8) NOT NULL DEFAULT 0,
    avg_cost_basis   NUMERIC(18,4) NOT NULL DEFAULT 0,
    version          INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_holdings_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    CONSTRAINT fk_holdings_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_holdings_portfolio_symbol
        UNIQUE (portfolio_id, symbol),
    CONSTRAINT chk_quantity CHECK (quantity >= 0)
);

CREATE INDEX idx_holdings_portfolio_id ON holdings (portfolio_id);
CREATE INDEX idx_holdings_symbol ON holdings (symbol);

COMMENT ON COLUMN holdings.version IS
    'P-01 Optimistic Locking: eş zamanlı trade race condition koruması.';
