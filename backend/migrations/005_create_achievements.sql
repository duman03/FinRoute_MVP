CREATE TABLE achievements (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    achievement_key  VARCHAR(80) NOT NULL,
    xp_reward        INTEGER     NOT NULL DEFAULT 0,
    metadata         JSONB,
    unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_achievements_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_achievements_user_key
        UNIQUE (user_id, achievement_key),
    CONSTRAINT chk_xp_reward CHECK (xp_reward >= 0)
);

CREATE INDEX idx_achievements_user_id ON achievements (user_id);
CREATE INDEX idx_achievements_metadata ON achievements USING GIN (metadata);
