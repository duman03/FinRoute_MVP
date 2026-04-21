import { pool } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { invalidateMissionCache } from './mission.service';
import { awardXp } from './xp.service';

export interface RewardResult {
  alreadyClaimed: boolean;
  xpAwarded: number;
  badgeAwarded: string | null;
  freezeAwarded: number;
  freezeCapReached: boolean;
}

interface ClaimableMissionRow {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'REWARD_CLAIMED';
  missionId: string;
  rewardXp: number;
  rewardBadge: string | null;
  rewardFreeze: number;
}

export async function claimMissionReward(
  userMissionId: string,
  userId: string
): Promise<RewardResult> {
  const idempotencyKey = `mission-reward:${userMissionId}`;
  const client = await pool.connect();

  let missionId = '';
  let configuredRewardXp = 0;
  let configuredRewardBadge: string | null = null;
  let freezeAwarded = 0;
  let freezeCapReached = false;
  let badgeAwarded: string | null = null;

  try {
    await client.query('BEGIN');

    const missionResult = await client.query<ClaimableMissionRow>(
      `SELECT
         um.status,
         um.mission_id AS "missionId",
         m.reward_xp AS "rewardXp",
         m.reward_badge AS "rewardBadge",
         m.reward_freeze AS "rewardFreeze"
       FROM user_missions um
       JOIN missions m ON m.id = um.mission_id
       WHERE um.id = $1 AND um.user_id = $2
       FOR UPDATE OF um`,
      [userMissionId, userId]
    );

    const missionRow = missionResult.rows[ 0 ];
    if (!missionRow) {
      throw new Error('USER_MISSION_NOT_FOUND');
    }

    if (missionRow.status === 'REWARD_CLAIMED') {
      await client.query('ROLLBACK');
      return {
        alreadyClaimed: true,
        xpAwarded: 0,
        badgeAwarded: null,
        freezeAwarded: 0,
        freezeCapReached: false,
      };
    }

    if (missionRow.status !== 'COMPLETED') {
      throw new Error('MISSION_NOT_COMPLETED');
    }

    missionId = missionRow.missionId;
    configuredRewardXp = missionRow.rewardXp;
    configuredRewardBadge = missionRow.rewardBadge;

    if (missionRow.rewardFreeze > 0) {
      await client.query(
        `INSERT INTO user_streaks (
           user_id,
           current_streak,
           longest_streak,
           last_check_in_date,
           freeze_count,
           created_at,
           updated_at
         )
         VALUES ($1, 0, 0, NULL, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      const freezeResult = await client.query(
        `UPDATE user_streaks
         SET freeze_count = LEAST(freeze_count + 1, 3),
             updated_at = NOW()
         WHERE user_id = $1
           AND freeze_count < 3
         RETURNING freeze_count`,
        [userId]
      );

      if (freezeResult.rowCount === 0) {
        freezeCapReached = true;
      } else {
        freezeAwarded = 1;
      }
    }

    if (configuredRewardBadge) {
      const badgeTableResult = await client.query<{ badgeTable: string | null }>(
        `SELECT to_regclass('public.user_badges')::TEXT AS "badgeTable"`
      );
      const badgeTable = badgeTableResult.rows[ 0 ]?.badgeTable || null;

      if (badgeTable) {
        const badgeInsertResult = await client.query(
          `INSERT INTO user_badges (user_id, badge_slug, earned_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id, badge_slug) DO NOTHING
           RETURNING badge_slug`,
          [userId, configuredRewardBadge]
        );

        if (badgeInsertResult.rowCount && badgeInsertResult.rowCount > 0) {
          badgeAwarded = configuredRewardBadge;
        }
      } else {
        logger.warn(`[MissionReward] user_badges table is not ready for mission ${userMissionId}`);
      }
    }

    const rewardLogResult = await client.query(
      `INSERT INTO mission_reward_log (
         user_mission_id,
         user_id,
         idempotency_key,
         xp_awarded,
         badge_awarded,
         freeze_awarded
       )
       VALUES ($1, $2, $3, 0, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [userMissionId, userId, idempotencyKey, badgeAwarded, freezeAwarded]
    );

    if (rewardLogResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        alreadyClaimed: true,
        xpAwarded: 0,
        badgeAwarded: null,
        freezeAwarded: 0,
        freezeCapReached: false,
      };
    }

    await client.query(
      `UPDATE user_missions
       SET status = 'REWARD_CLAIMED',
           claimed_at = COALESCE(claimed_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [userMissionId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  let xpAwarded = 0;

  if (configuredRewardXp > 0) {
    try {
      const xpResult = await awardXp(
        userId,
        'MISSION_COMPLETED',
        configuredRewardXp,
        { missionId, userMissionId },
        idempotencyKey
      );

      xpAwarded = xpResult.awarded ? configuredRewardXp : 0;
    } catch (error: any) {
      logger.error(`[MissionReward] XP award failed for mission ${userMissionId}: ${error.message}`);
    }

    try {
      await pool.query(
        `UPDATE mission_reward_log
         SET xp_awarded = $1
         WHERE idempotency_key = $2`,
        [xpAwarded, idempotencyKey]
      );
    } catch (error: any) {
      logger.error(`[MissionReward] Reward log XP update failed for mission ${userMissionId}: ${error.message}`);
    }
  }

  await invalidateMissionCache(userId).catch((error: any) => {
    logger.warn(`[MissionReward] Mission cache invalidation failed for user ${userId}: ${error.message}`);
  });

  if (xpAwarded > 0) {
    await redis.del(`xp:profile:${userId}`).catch((error: any) => {
      logger.warn(`[MissionReward] XP profile cache invalidation failed for user ${userId}: ${error.message}`);
    });
  }

  if (freezeAwarded > 0) {
    await redis.del(`streak:info:${userId}`).catch((error: any) => {
      logger.warn(`[MissionReward] Streak cache invalidation failed for user ${userId}: ${error.message}`);
    });
  }

  return {
    alreadyClaimed: false,
    xpAwarded,
    badgeAwarded,
    freezeAwarded,
    freezeCapReached,
  };
}
