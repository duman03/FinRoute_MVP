import { pool } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { getServerUtcDate, getWeekMondayUtc } from '../utils/time.utils';

export interface AccountDeletionResult {
  deletedAt: Date;
  scheduledForDeletionAt: Date;
}

// ─── Get User Profile ────────────────────────────────────────
export const getUserById = async (userId: string) => {
  const result = await pool.query(
    `SELECT id, email, display_name, virtual_balance, avatar_url,
            is_active, created_at, updated_at,
            timezone_offset_minutes, device_token, notifications_enabled
     FROM users WHERE id = $1 AND is_active = TRUE`,
    [userId]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ] || null;
};

// ─── Update User Profile ────────────────────────────────────
export const updateUser = async (
  userId: string,
  updates: { displayName?: string; avatarUrl?: string }
) => {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.displayName !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    values.push(updates.displayName);
  }
  if (updates.avatarUrl !== undefined) {
    setClauses.push(`avatar_url = $${paramIndex++}`);
    values.push(updates.avatarUrl);
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await pool.query(
    `UPDATE users SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND is_active = TRUE
     RETURNING id, email, display_name, virtual_balance, avatar_url, updated_at`,
    values
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ] || null;
};

// ─── Soft Delete User (Apple 5.1.1 / v4.7) ───────────────────
export const deleteUserAccount = async (userId: string): Promise<AccountDeletionResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE',
      [userId]
    );

    if (!userResult.rows[ 0 ]) {
      throw new Error('USER_NOT_FOUND');
    }

    await client.query('SELECT soft_delete_user($1)', [userId]);

    const deletionResult = await client.query<{
      updated_at: Date;
      scheduled_for_deletion_at: Date;
    }>(
      `SELECT updated_at, scheduled_for_deletion_at
       FROM users
       WHERE id = $1 AND is_active = FALSE`,
      [userId]
    );

    const deletion = deletionResult.rows[ 0 ];
    if (!deletion?.scheduled_for_deletion_at) {
      throw new Error('SOFT_DELETE_FAILED');
    }

    await client.query('COMMIT');

    return {
      deletedAt: deletion.updated_at,
      scheduledForDeletionAt: deletion.scheduled_for_deletion_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── Post-Delete Side Effects (all non-fatal) ────────────────
// EC-18: DEL session
// EC-13: ZREM lb:global
// EC-15: ZREM all league tiers for current week
// EC-17: SCAN lb:league:* + Pipeline ZREM (historical)
// D7: Cancel pending notification BullMQ jobs
export const executePostDeleteSideEffects = async (userId: string): Promise<void> => {
  try {
    // EC-18: DEL session:{userId}
    await redis.del(`session:${userId}`);

    // EC-13: ZREM lb:global userId
    await redis.zrem('lb:global', userId);

    // EC-15: ZREM from all league tier sorted sets for current week
    const weekStartStr = getWeekMondayUtc(getServerUtcDate());

    const leagues = ['bronze', 'silver', 'gold', 'diamond'];
    await Promise.all(
      leagues.map((league) =>
        redis.zrem(`lb:league:${league}:${weekStartStr}`, userId)
      )
    );

    // EC-17: SCAN lb:league:* + Pipeline ZREM (remove from all historical league ZSets)
    await removeUserFromAllHistoricalLeagueZSets(userId);

    // D7: Cancel pending notification BullMQ jobs
    await cancelPendingNotificationJobsForUser(userId);
  } catch (err) {
    // All side effects are non-fatal — log and continue
    logger.error('Post-delete side effect error (non-fatal):', err);
  }
};

// EC-17: Remove user from all historical league ZSets
const removeUserFromAllHistoricalLeagueZSets = async (userId: string): Promise<void> => {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor, 'MATCH', 'lb:league:*', 'COUNT', 100
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.zrem(key, userId);
      }
      await pipeline.exec().catch((err: Error) =>
        logger.error('[AccountDelete] League ZSET cleanup failed (non-fatal):', err)
      );
    }
  } while (cursor !== '0');
};

// D7: Cancel pending notification BullMQ jobs for user
const cancelPendingNotificationJobsForUser = async (userId: string): Promise<void> => {
  try {
    const { notificationQueue } = await import('../jobs/notification.job');
    const allJobs = await notificationQueue.getJobs(['waiting', 'delayed', 'active']);

    let removed = 0;
    for (const job of allJobs) {
      if (job.data?.userId === userId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`Notification job cleanup: ${removed} job(s) removed for user ${userId}`);
    }
  } catch (err) {
    logger.error(`Notification job cleanup failed for user ${userId} (non-fatal):`, err);
  }
};
