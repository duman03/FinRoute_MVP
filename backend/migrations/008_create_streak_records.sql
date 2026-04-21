CREATE TABLE streak_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    streak_date     DATE        NOT NULL,
    activity_type   VARCHAR(40) NOT NULL DEFAULT 'daily_login',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_streak_user_date UNIQUE (user_id, streak_date),
    CONSTRAINT fk_streak_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_streak_records_user_date ON streak_records (user_id, streak_date DESC);

COMMENT ON TABLE streak_records IS
    'Streak tracking — one record per user per day. Server-side UTC date only.';
