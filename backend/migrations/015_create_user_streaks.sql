-- D17: Streak & Günlük Check-in Veri Modeli (M-02 UTC uyumlu)

-- Tablo 1: Kullanıcı streak durumu (tek satır per user)
CREATE TABLE user_streaks (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak     INTEGER      NOT NULL DEFAULT 0,
  longest_streak     INTEGER      NOT NULL DEFAULT 0,
  last_check_in_date DATE,                         -- UTC date, app layer tarafından set edilir
  freeze_count       INTEGER      NOT NULL DEFAULT 1 CHECK (freeze_count >= 0 AND freeze_count <= 3),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tablo 2: Günlük check-in audit log
CREATE TABLE daily_check_ins (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in_date     DATE         NOT NULL,         -- UTC date (M-02)
  check_in_ts       TIMESTAMPTZ  NOT NULL DEFAULT NOW(), -- F-03 anomali tespiti için tam zaman damgası
  streak_at_checkin INTEGER      NOT NULL,         -- Check-in anındaki streak değeri (audit)
  freeze_consumed   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- İkincil idempotency: Aynı kullanıcı + aynı gün → 1 kayıt
CREATE UNIQUE INDEX uidx_daily_check_ins_user_date
  ON daily_check_ins (user_id, check_in_date);

-- Hızlı streak sorgulama
CREATE INDEX idx_daily_check_ins_user_ts
  ON daily_check_ins (user_id, check_in_ts DESC);

-- updated_at otomatik güncelleme trigger'ı
CREATE OR REPLACE FUNCTION update_user_streaks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_streaks_updated_at
  BEFORE UPDATE ON user_streaks
  FOR EACH ROW EXECUTE FUNCTION update_user_streaks_updated_at();