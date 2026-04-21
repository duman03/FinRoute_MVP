CREATE TABLE anomaly_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type   VARCHAR(80) NOT NULL,
    anomaly_score INTEGER NOT NULL DEFAULT 0,
    flags         JSONB DEFAULT '{}',
    ip_address    VARCHAR(45),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anomaly_log_user ON anomaly_log (user_id, created_at DESC);