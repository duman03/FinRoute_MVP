CREATE TABLE idempotency_keys (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(255) NOT NULL,
    user_id     UUID        NOT NULL,
    response    JSONB       NOT NULL,
    status_code INTEGER     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

    CONSTRAINT uq_idempotency_key UNIQUE (key, user_id),
    CONSTRAINT fk_idempotency_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys (expires_at);

COMMENT ON TABLE idempotency_keys IS
    'A-01: Idempotency key storage — duplicate trade prevention.';
