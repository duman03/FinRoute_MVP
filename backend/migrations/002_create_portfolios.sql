CREATE TABLE portfolios (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    name             VARCHAR(100) NOT NULL,
    description      TEXT,
    initial_balance  NUMERIC(18,4) NOT NULL DEFAULT 100000.0000,
    current_balance  NUMERIC(18,4) NOT NULL DEFAULT 100000.0000,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_portfolios_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_current_balance CHECK (current_balance >= 0)
);

CREATE INDEX idx_portfolios_user_id ON portfolios (user_id);
