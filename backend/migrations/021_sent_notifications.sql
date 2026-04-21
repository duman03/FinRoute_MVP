-- D1-C: DB-level bildirim idempotency tablosu
-- Aynı kullanıcıya aynı gün aynı tipte iki bildirim gönderilemez.
-- notification-q worker birden fazla pod'da çalışsa bile
-- ON CONFLICT DO NOTHING ile çift gönderim engellenir.

CREATE TABLE IF NOT EXISTS sent_notifications (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notif_type    TEXT         NOT NULL,
  sent_date     DATE         NOT NULL,
  device_token  TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sent_notification UNIQUE (user_id, notif_type, sent_date)
);

-- Günlük temizleme sorguları için index
CREATE INDEX IF NOT EXISTS idx_sent_notifications_date
  ON sent_notifications (sent_date DESC);
