import { Job, Queue, Worker } from 'bullmq';
import { pool } from '../config/database';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { getCurrentLeagueSlug, getCurrentLeagueWeekStart, LEAGUE_SLUGS, type LeagueSlug } from '../services/league.service';
import {
  getGlobalLeaderboardKey,
  getLeagueLeaderboardKey,
  LEAGUE_LB_TTL_SECONDS,
  getUserTotalXp,
  writeLeaderboardScores,
} from '../services/leaderboard.service';
import { releaseRedisLockIfOwned } from '../utils/redis-lock';
import { logger } from '../utils/logger';

const connection = { url: env.REDIS_URL };

interface SyncUserJobData {
  fallbackLeagueSlug?: LeagueSlug;
  userId: string;
}

export const leaderboardSyncQueue = new Queue<SyncUserJobData>(
  'leaderboard-sync-q',
  {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: false,
    },
  }
);

export async function enqueueSyncUser(
  userId: string,
  fallbackLeagueSlug?: LeagueSlug
): Promise<void> {
  await leaderboardSyncQueue.add(
    'sync-user',
    { userId, fallbackLeagueSlug },
    {
      jobId: `sync-user-${userId}-${Date.now()}`,
    }
  );
}

export async function scheduleFullReconcile(): Promise<void> {
  await leaderboardSyncQueue.add(
    'full-reconcile',
    { userId: 'system' },
    {
      jobId: 'leaderboard-full-reconcile-weekly',
      repeat: {
        key: 'leaderboard-full-reconcile-weekly',
        pattern: '30 23 * * 6',
        tz: 'UTC',
      },
    }
  );
}

async function handleSyncUser(data: SyncUserJobData): Promise<void> {
  const totalXp = await getUserTotalXp(data.userId);
  const leagueSlug = await getCurrentLeagueSlug(data.userId)
    .catch(() => data.fallbackLeagueSlug || 'bronze');

  await writeLeaderboardScores(data.userId, totalXp, leagueSlug);

  logger.info(`LeaderboardSync: ${data.userId} senkronize edildi. XP=${totalXp}`);
}

// Advisory lock sabit ID'si — tüm pod'lar aynı sayıyı kullanır.
const RECONCILE_ADVISORY_LOCK_ID = 7_391_045;

async function handleFullReconcile(): Promise<void> {
  const weekStart = getCurrentLeagueWeekStart();
  let client: import('pg').PoolClient | null = null;

  try {
    client = await pool.connect();

    // D2-A: lock_timeout → bu bağlantı için geçerli
    await client.query(`SET lock_timeout = '10s'`);

    // D2-B: pg_try_advisory_lock — non-blocking.
    // false dönerse başka bir pod zaten çalışıyor → sessizce çık.
    const lockRes = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [RECONCILE_ADVISORY_LOCK_ID],
    );

    if (!lockRes.rows[ 0 ]?.acquired) {
      logger.warn('[FullReconcile] Advisory lock alınamadı — başka pod çalışıyor, atlanıyor.');
      return;
    }

    logger.info(`[FullReconcile] ${weekStart} haftası için başlatıldı.`);

    // D2-C: MATERIALIZED VIEW refresh — KESİNLİKLE transaction DIŞINDA.
    // pool.query() bağımsız bağlantı kullanır — client transaction'ından izole.
    await pool.query(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY user_xp_totals`
    );
    logger.info('[FullReconcile] user_xp_totals MATERIALIZED VIEW yenilendi ✅');

    // MV güncel → Redis ZSET senkronizasyonu
    const snapshotResult = await client.query<{
      user_id: string;
      total_xp: string;
      league_slug: LeagueSlug;
    }>(
      `SELECT
         mv.user_id,
         mv.total_xp::TEXT,
         COALESCE(ula.league_slug, 'bronze') AS league_slug
       FROM user_xp_totals mv
       LEFT JOIN user_league_assignments ula
         ON  ula.user_id    = mv.user_id
         AND ula.week_start = $1::DATE
       WHERE ula.final_rank IS NULL`,
      [weekStart],
    );

    if (!snapshotResult.rows[ 0 ]) {
      logger.info('[FullReconcile] Bu hafta XP kaydı yok.');
      return;
    }

    const pipeline = redis.pipeline();
    const leagueKeys = new Set<string>();

    const { rows: snapshotRows } = snapshotResult;
    for (const row of snapshotRows) {
      const totalXp = Number(row.total_xp);
      const leagueKey = getLeagueLeaderboardKey(row.league_slug, weekStart);
      pipeline.zadd(getGlobalLeaderboardKey(), totalXp, row.user_id);
      pipeline.zadd(leagueKey, totalXp, row.user_id);
      leagueKeys.add(leagueKey);
    }
    for (const key of leagueKeys) {
      pipeline.expire(key, LEAGUE_LB_TTL_SECONDS);
    }

    await pipeline.exec();
    logger.info(`[FullReconcile] ✅ ${snapshotResult.rowCount} kullanıcı Redis ZSET'e yazıldı.`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[FullReconcile] HATA:', message);
    throw err;

  } finally {
    if (client) {
      // Advisory lock: explicit release — savunmacı programlama
      try {
        await client.query(
          `SELECT pg_advisory_unlock($1)`, [RECONCILE_ADVISORY_LOCK_ID]
        );
      } catch (_) { /* kapanma sırasında hata olursa yut */ }
      client.release();
    }
  }
}

export const leaderboardSyncWorker = new Worker<SyncUserJobData>(
  'leaderboard-sync-q',
  async (job: Job<SyncUserJobData>) => {
    if (job.name === 'sync-user') {
      await handleSyncUser(job.data);
      return;
    }

    if (job.name === 'full-reconcile') {
      await handleFullReconcile();
      return;
    }

    logger.warn(`LeaderboardSync: Bilinmeyen job tipi ${job.name}`);
  },
  {
    connection,
    concurrency: 5,
    lockDuration: 600_000,
    lockRenewTime: 180_000,
  }
);

leaderboardSyncWorker.on('failed', (job, error) => {
  logger.error(`LeaderboardSyncWorker ${job?.id} basarisiz:`, error.message);
});
