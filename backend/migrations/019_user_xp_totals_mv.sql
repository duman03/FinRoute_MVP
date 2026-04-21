-- D33: Materialized View — full-reconcile sorgu optimizasyonu
-- CONCURRENTLY refresh için UNIQUE INDEX zorunludur.
-- Hafta 8 handleFullReconcile içindeki GROUP BY SUM(xp) sorgusunu
-- önceden hesaplanmış tek satıra indirger.

CREATE MATERIALIZED VIEW IF NOT EXISTS user_xp_totals AS
SELECT
  user_id,
  COALESCE(SUM(xp), 0)::INTEGER   AS total_xp,
  COUNT(*)::INTEGER                AS event_count,
  MAX(created_at)                  AS last_xp_at
FROM xp_events
GROUP BY user_id
WITH DATA;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY zorunlu koşulu: UNIQUE INDEX
CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_xp_totals_user_id
  ON user_xp_totals (user_id);

-- Leaderboard sıralama sorgularını hızlandıran ek index
CREATE INDEX IF NOT EXISTS idx_user_xp_totals_total_xp
  ON user_xp_totals (total_xp DESC);

-- Not: Uygulama başlatıldığında veya full-reconcile sonunda:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY user_xp_totals;
