import { Job, Queue, Worker } from 'bullmq';
import { pool } from '../config/database';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { awardXp } from '../services/xp.service';
import { enqueueNotification } from './notification.job';
import { getServerUtcDate } from '../utils/time.utils';
import {
  freezeLeagueSnapshot,
  getUserTotalXp,
  getLeagueLeaderboardKey,
  LEAGUE_LB_TTL_SECONDS,
} from '../services/leaderboard.service';
import {
  getAdjacentLeagueSlug,
  getClosingLeagueWeekStart,
  getNextWeekMonday,
  LEAGUE_SLUGS,
  type LeagueResult,
  type LeagueSlug,
} from '../services/league.service';
import { releaseRedisLockIfOwned } from '../utils/redis-lock';
import { logger } from '../utils/logger';

const connection = { url: env.REDIS_URL };

const WINNER_REWARDS: Record<number, { badge: string; xp: number }> = {
  1: { xp: 150, badge: 'league-champion' },
  2: { xp: 75, badge: 'league-runner-up' },
  3: { xp: 30, badge: 'league-third-place' },
};

export const leaguePromotionQueue = new Queue(
  'league-promotion-q',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 10 },
      removeOnFail: false,
    },
  }
);

export async function scheduleLeaguePromotion(): Promise<void> {
  await leaguePromotionQueue.add(
    'promote-relegate',
    {},
    {
      jobId: 'league-promotion-weekly',
      repeat: {
        key: 'league-promotion-weekly',
        pattern: '0 0 * * 0',
        tz: 'UTC',
      },
    }
  );
}

async function distributeWinnerReward(
  userId: string,
  weekStart: string,
  rank: number,
  leagueSlug: LeagueSlug
): Promise<void> {
  const reward = WINNER_REWARDS[rank];
  if (!reward) {
    return;
  }

  const badgeSlug = `${reward.badge}-${leagueSlug}`;
  const idempotencyKey = `league-reward:${userId}:${weekStart}:rank${rank}`;
  const xpResult = await awardXp(
    userId,
    'LEAGUE_WINNER',
    reward.xp,
    { leagueSlug, rank, weekStart },
    idempotencyKey
  );

  await pool.query(
    `INSERT INTO user_badges (user_id, badge_slug)
     VALUES ($1, $2)
     ON CONFLICT (user_id, badge_slug) DO NOTHING`,
    [userId, badgeSlug]
  );

  await pool.query(
    `INSERT INTO league_reward_log (
       user_id,
       week_start,
       reward_type,
       idempotency_key,
       xp_awarded,
       badge_awarded
     )
     VALUES ($1, $2::DATE, 'XP_WINNER', $3, $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, weekStart, idempotencyKey, xpResult.awarded ? reward.xp : 0, badgeSlug]
  );

  // Hafta 9 Eklentisi: Lig yükselme bildirimi kuyruğa at
  const deviceRes = await pool.query<{ device_token: string; display_name: string }>(
    `SELECT device_token, display_name FROM users WHERE id = $1 AND device_token IS NOT NULL`,
    [userId]
  );
  if (deviceRes.rows[ 0 ]) {
    const { device_token, display_name } = deviceRes.rows[ 0 ];
    await enqueueNotification({
      userId,
      deviceToken: device_token,
      type: 'LEAGUE_PROMOTED',
      title: '🏆 Tebrikler!',
      body: `${display_name}, ${leagueSlug.charAt(0).toUpperCase() + leagueSlug.slice(1)} Lig'e yükseldin!`,
      data: { screen: 'leaderboard', leagueSlug },
    }, getServerUtcDate());
  }
}

async function seedNextWeekLeaderboard(
  nextAssignments: Array<{ leagueSlug: LeagueSlug; userId: string }>,
  nextWeekStart: string
): Promise<void> {
  if (nextAssignments.length === 0) {
    return;
  }

  const totalXpByUser = new Map<string, number>();

  for (const assignment of nextAssignments) {
    if (!totalXpByUser.has(assignment.userId)) {
      totalXpByUser.set(assignment.userId, await getUserTotalXp(assignment.userId));
    }
  }

  const pipeline = redis.pipeline();
  const touchedKeys = new Set<string>();

  for (const assignment of nextAssignments) {
    const leagueKey = getLeagueLeaderboardKey(assignment.leagueSlug, nextWeekStart);

    pipeline.zadd(leagueKey, totalXpByUser.get(assignment.userId) || 0, assignment.userId);
    touchedKeys.add(leagueKey);
  }

  for (const key of touchedKeys) {
    pipeline.expire(key, LEAGUE_LB_TTL_SECONDS);
  }

  await pipeline.exec();
}

async function processLeague(
  leagueSlug: LeagueSlug,
  weekStart: string
): Promise<void> {
  const snapshot = await freezeLeagueSnapshot(leagueSlug, weekStart);
  if (snapshot.length === 0) {
    return;
  }

  const totalUsers = snapshot.length;
  const promotionCutoff = Math.ceil(totalUsers * 0.20);
  const relegationCutoff = Math.floor(totalUsers * 0.80);
  const nextWeekStart = getNextWeekMonday(weekStart);
  const nextAssignments: Array<{ leagueSlug: LeagueSlug; userId: string }> = [];

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let index = 0; index < snapshot.length; index += 1) {
      const entry = snapshot[index];
      const rank = index + 1;
      const result: LeagueResult = rank <= promotionCutoff
        ? 'PROMOTED'
        : rank > relegationCutoff
          ? 'RELEGATED'
          : 'STAYED';

      await client.query(
        `UPDATE user_league_assignments
         SET final_rank = $1,
             final_xp = $2,
             result = $3,
             updated_at = NOW()
         WHERE user_id = $4
           AND week_start = $5::DATE
           AND league_slug = $6
           AND final_rank IS NULL`,
        [rank, entry.score, result, entry.userId, weekStart, leagueSlug]
      );

      const nextLeagueSlug = await getAdjacentLeagueSlug(client, leagueSlug, result);

      await client.query(
        `INSERT INTO user_league_assignments (user_id, league_slug, week_start)
         VALUES ($1, $2, $3::DATE)
         ON CONFLICT (user_id, week_start) DO NOTHING`,
        [entry.userId, nextLeagueSlug, nextWeekStart]
      );

      nextAssignments.push({
        leagueSlug: nextLeagueSlug,
        userId: entry.userId,
      });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (let index = 0; index < Math.min(3, snapshot.length); index += 1) {
    await distributeWinnerReward(snapshot[index].userId, weekStart, index + 1, leagueSlug);
  }

  await seedNextWeekLeaderboard(nextAssignments, nextWeekStart);
}

export async function runLeaguePromotionForWeek(weekStart: string): Promise<void> {
  for (const leagueSlug of LEAGUE_SLUGS) {
    await processLeague(leagueSlug, weekStart);
  }
}

export const leaguePromotionWorker = new Worker(
  'league-promotion-q',
  async (job: Job) => {
    const closingWeekStart = getClosingLeagueWeekStart();
    const lockKey = `league:promotion:lock:${closingWeekStart}`;
    const lockValue = String(job.id || `league-promotion:${closingWeekStart}`);
    const acquired = await redis.set(lockKey, lockValue, 'EX', 660, 'NX');

    if (acquired !== 'OK') {
      logger.warn(`LeaguePromotion: ${closingWeekStart} icin kilit alinmadi. Baska instance calisiyor.`);
      return;
    }

    try {
      await runLeaguePromotionForWeek(closingWeekStart);

      logger.info(`LeaguePromotion: ${closingWeekStart} haftasi tamamlandi.`);
    } finally {
      const released = await releaseRedisLockIfOwned(lockKey, lockValue);
      if (released === 0) {
        logger.warn(`LeaguePromotion: ${closingWeekStart} kilidi stale duruma dusmustu.`);
      }
    }
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000,
    lockRenewTime: 180_000,
  }
);

leaguePromotionWorker.on('failed', (job, error) => {
  logger.error(`LeaguePromotionWorker ${job?.id} basarisiz:`, error.message);
});
