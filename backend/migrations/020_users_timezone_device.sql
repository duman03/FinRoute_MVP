-- D35: Akıllı zamanlama algoritması için users tablosuna 3 kolon eklenir.
-- timezone_offset_minutes: UTC offset dakika cinsinden (Türkiye=+180, EST=-300)
-- device_token: Firebase Cloud Messaging cihaz token'ı
-- notifications_enabled: Etik opt-out bayrağı

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone_offset_minutes INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_tz_offset CHECK (timezone_offset_minutes BETWEEN -720 AND 840),

  ADD COLUMN IF NOT EXISTS device_token TEXT,

  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Saatlik cron sorgusu için partial index (yalnızca token + opt-in kullanıcılar)
CREATE INDEX IF NOT EXISTS idx_users_notif_eligible
  ON users (timezone_offset_minutes)
  WHERE device_token IS NOT NULL
    AND notifications_enabled = TRUE;
