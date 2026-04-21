-- Additional composite indexes for common query patterns (A-03)

-- Leaderboard: quick XP sum per user
CREATE INDEX idx_xp_events_user_source ON xp_events (user_id, source);

-- Active user filtering
CREATE INDEX idx_users_active ON users (is_active) WHERE is_active = TRUE;

-- Pending transactions cleanup
CREATE INDEX idx_transactions_status ON transactions (status) WHERE status = 'PENDING';

-- Streak: current streak calculation
CREATE INDEX idx_streak_activity ON streak_records (user_id, activity_type, streak_date DESC);
