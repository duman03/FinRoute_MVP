-- v4.7 release policy: immediate soft-delete, anonymization, and 30-day hard-delete window.
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET
    is_active                 = FALSE,
    email                     = 'deleted_' || p_user_id || '@finroute.app',
    password_hash             = 'deleted_' || p_user_id,
    display_name              = 'Deleted User',
    avatar_url                = NULL,
    device_token              = NULL,
    notifications_enabled     = FALSE,
    scheduled_for_deletion_at = NOW() + INTERVAL '30 days',
    updated_at                = NOW()
  WHERE id = p_user_id
    AND is_active = TRUE;
END;
$$;

ALTER TABLE xp_events
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS xp_events_user_id_fkey,
  ADD CONSTRAINT xp_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE streak_records
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS streak_records_user_id_fkey,
  ADD CONSTRAINT streak_records_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE anomaly_log
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS anomaly_log_user_id_fkey,
  ADD CONSTRAINT anomaly_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sent_notifications
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS sent_notifications_user_id_fkey,
  ADD CONSTRAINT sent_notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE league_reward_log
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS league_reward_log_user_id_fkey,
  ADD CONSTRAINT league_reward_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
