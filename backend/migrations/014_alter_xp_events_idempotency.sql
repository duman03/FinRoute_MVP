-- idempotency_key kolonu ekle (TEXT, UUID DEĞİL — BullMQ job.id uyumu)
ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Full unique index (partial DEĞİL — ON CONFLICT uyumu)
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_user_idem
  ON xp_events (user_id, idempotency_key);