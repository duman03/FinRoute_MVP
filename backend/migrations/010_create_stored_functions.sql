-- P-01: Optimistic lock guard for trade worker
CREATE OR REPLACE FUNCTION update_holding_with_lock(
    p_portfolio_id  UUID,
    p_symbol        VARCHAR,
    p_delta         NUMERIC,
    p_expected_ver  INTEGER,
    p_new_avg_cost  NUMERIC
) RETURNS INTEGER AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    UPDATE holdings
    SET
        quantity       = quantity + p_delta,
        avg_cost_basis = p_new_avg_cost,
        version        = version + 1,
        updated_at     = NOW()
    WHERE portfolio_id = p_portfolio_id
      AND symbol       = p_symbol
      AND version      = p_expected_ver
      AND (quantity + p_delta) >= 0;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;

    IF rows_updated = 0 THEN
        RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'
            USING HINT = 'Retry transaction with fresh version.';
    END IF;

    RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;

-- Apple 5.1.1: Soft delete user
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET
    is_active                 = FALSE,
    email                     = 'deleted_' || p_user_id || '@finroute.app',
    scheduled_for_deletion_at = NOW() + INTERVAL '30 days'
  WHERE id = p_user_id
    AND is_active = TRUE;
END;
$$;

-- Apple 5.1.1: Permanent deletion cron helper
CREATE OR REPLACE FUNCTION permanently_delete_expired_users()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM users
  WHERE is_active = FALSE
    AND scheduled_for_deletion_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
