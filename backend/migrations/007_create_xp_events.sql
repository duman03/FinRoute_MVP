CREATE TABLE xp_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL,
    user_id     UUID        NOT NULL,
    xp          INTEGER     NOT NULL,
    source      VARCHAR(80) NOT NULL,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_xp_event_id UNIQUE (event_id),
    CONSTRAINT fk_xp_events_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_xp CHECK (xp > 0)
);

CREATE INDEX idx_xp_events_user_id ON xp_events (user_id, created_at DESC);

COMMENT ON TABLE xp_events IS
    'XP event log — idempotent via event_id UNIQUE constraint (replay protection).';
