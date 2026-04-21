-- D27 + D28: Hafta 8 Rozet ve Lig veri modeli
-- Repo migration sirasi 017'ye kadar ilerledigi icin blocker ve league semasi tek migration'da toplanmistir.

-- XP motoru uzun suredir idempotency_key tabanli calisiyor.
-- event_id kolonunu uyumlu hale getirerek eski migration ile guncel servis arasindaki runtime catisma kapatilir.
ALTER TABLE xp_events ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE xp_events ALTER COLUMN event_id SET DEFAULT gen_random_uuid();

CREATE TABLE user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug TEXT NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_badge UNIQUE (user_id, badge_slug)
);

CREATE INDEX idx_user_badges_user
  ON user_badges (user_id, earned_at DESC);

CREATE TABLE leagues (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  tier_order INTEGER NOT NULL UNIQUE
);

INSERT INTO leagues (slug, name, tier_order)
VALUES
  ('bronze', 'Bronz Lig', 1),
  ('silver', 'Gumus Lig', 2),
  ('gold', 'Altin Lig', 3),
  ('diamond', 'Elmas Lig', 4)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE user_league_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_slug TEXT NOT NULL REFERENCES leagues(slug),
  week_start  DATE NOT NULL,
  final_rank  INTEGER,
  final_xp    INTEGER,
  result      TEXT CHECK (result IN ('PROMOTED', 'RELEGATED', 'STAYED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_league_week UNIQUE (user_id, week_start)
);

CREATE INDEX idx_ula_league_week
  ON user_league_assignments (league_slug, week_start);

CREATE INDEX idx_ula_user
  ON user_league_assignments (user_id, week_start DESC);

CREATE TABLE league_reward_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  reward_type     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  xp_awarded      INTEGER NOT NULL DEFAULT 0,
  badge_awarded   TEXT,
  awarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lrl_user
  ON league_reward_log (user_id, awarded_at DESC);

CREATE TRIGGER trg_ula_updated_at
  BEFORE UPDATE ON user_league_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
