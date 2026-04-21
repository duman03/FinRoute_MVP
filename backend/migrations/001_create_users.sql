CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email            VARCHAR(320) NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    display_name     VARCHAR(80)  NOT NULL,
    virtual_balance  NUMERIC(18,4) NOT NULL DEFAULT 100000.0000,
    avatar_url       VARCHAR(512),
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    scheduled_for_deletion_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_virtual_balance CHECK (virtual_balance >= 0)
);

CREATE INDEX idx_users_email ON users (email);

COMMENT ON COLUMN users.virtual_balance IS
    'Sanal para birimi — gerçek para değil. Tüm işlemler simüle edilir.';
