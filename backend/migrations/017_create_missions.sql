-- D23: Hafta 7 Mission Motoru veri modeli

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE missions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  mission_type   TEXT NOT NULL CHECK (mission_type IN ('DAILY', 'WEEKLY')),
  target_event   TEXT NOT NULL,
  target_filter  JSONB,
  required_count INTEGER NOT NULL CHECK (required_count > 0),
  reward_xp      INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  reward_badge   TEXT,
  reward_freeze  INTEGER NOT NULL DEFAULT 0 CHECK (reward_freeze >= 0 AND reward_freeze <= 1),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_missions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  period_date    DATE NOT NULL,
  current_count  INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  required_count INTEGER NOT NULL CHECK (required_count > 0),
  status         TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'REWARD_CLAIMED')),
  completed_at   TIMESTAMPTZ,
  claimed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_mission_period UNIQUE (user_id, mission_id, period_date),
  CONSTRAINT chk_user_mission_progress CHECK (current_count <= required_count)
);

CREATE TABLE mission_reward_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_mission_id  UUID NOT NULL REFERENCES user_missions(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL UNIQUE,
  xp_awarded       INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  badge_awarded    TEXT,
  freeze_awarded   INTEGER NOT NULL DEFAULT 0 CHECK (freeze_awarded >= 0),
  awarded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mission_progress_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_mission_id  UUID NOT NULL REFERENCES user_missions(id) ON DELETE CASCADE,
  event_id         TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  event_time       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_mission_event UNIQUE (user_mission_id, event_id)
);

CREATE INDEX idx_user_missions_user_status
  ON user_missions (user_id, status);

CREATE INDEX idx_user_missions_period
  ON user_missions (mission_id, period_date);

CREATE INDEX idx_mission_reward_user
  ON mission_reward_log (user_id, awarded_at DESC);

CREATE INDEX idx_mission_progress_event_time
  ON mission_progress_events (event_type, event_time DESC);

CREATE TRIGGER trg_user_missions_updated_at
  BEFORE UPDATE ON user_missions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

INSERT INTO missions (
  slug,
  title,
  description,
  mission_type,
  target_event,
  target_filter,
  required_count,
  reward_xp,
  reward_badge,
  reward_freeze
)
VALUES
  (
    'buy_tech_stock_daily',
    '1 Teknoloji Hissesi Al',
    'Bugun teknoloji sektorunden 1 sanal hisse satin al.',
    'DAILY',
    'trade_created',
    '{"sector":"technology","action":"BUY"}'::jsonb,
    1,
    30,
    NULL,
    0
  ),
  (
    'read_dividend_article',
    'Temettu Makalesini Oku',
    'Temettu konusunda bir okuryazarlik icerigini tamamla.',
    'DAILY',
    'article_read',
    '{"article_tag":"dividend"}'::jsonb,
    1,
    20,
    NULL,
    0
  )
ON CONFLICT (slug) DO NOTHING;
