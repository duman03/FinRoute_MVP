import { Job, Worker } from 'bullmq';
import { pool } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { invalidateMissionCache } from '../services/mission.service';
import type {
  ArticleReadMissionEvent,
  TradeCreatedMissionEvent,
} from '../services/mission-event.service';
import { getUtcDateFromIso, getWeekMondayUtc } from '../utils/time.utils';

interface MissionProgressRow {
  userMissionId: string;
  targetFilter: Record<string, string> | null;
  currentCount: number;
  requiredCount: number;
}

function matchesTargetFilter(
  targetFilter: Record<string, string> | null,
  payload: Record<string, string>
): boolean {
  if (!targetFilter) {
    return true;
  }

  return Object.entries(targetFilter).every(([key, value]) => payload[key] === value);
}

async function updateMissionProgress(input: {
  userId: string;
  eventId: string;
  eventType: 'trade_created' | 'article_read';
  eventTime: string;
  payload: Record<string, string>;
}): Promise<void> {
  const eventDateUtc = getUtcDateFromIso(input.eventTime);
  const eventWeekMondayUtc = getWeekMondayUtc(eventDateUtc);
  const client = await pool.connect();

  let missionUpdated = false;

  try {
    await client.query('BEGIN');

    const missionResult = await client.query<MissionProgressRow>(
      `SELECT
         um.id AS "userMissionId",
         m.target_filter AS "targetFilter",
         um.current_count AS "currentCount",
         um.required_count AS "requiredCount"
       FROM user_missions um
       JOIN missions m ON m.id = um.mission_id
       WHERE um.user_id = $1
         AND m.target_event = $2
         AND m.is_active = TRUE
         AND um.status = 'IN_PROGRESS'
         AND (
           (m.mission_type = 'DAILY' AND um.period_date = $3::DATE) OR
           (m.mission_type = 'WEEKLY' AND um.period_date = $4::DATE)
         )
       FOR UPDATE OF um`,
      [input.userId, input.eventType, eventDateUtc, eventWeekMondayUtc]
    );

    const { rows: missions } = missionResult;
    for (const row of missions) {
      if (!matchesTargetFilter(row.targetFilter, input.payload)) {
        continue;
      }

      const idempotencyResult = await client.query(
        `INSERT INTO mission_progress_events (
           user_mission_id,
           event_id,
           event_type,
           event_time
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_mission_id, event_id) DO NOTHING`,
        [row.userMissionId, input.eventId, input.eventType, input.eventTime]
      );

      if (idempotencyResult.rowCount === 0) {
        continue;
      }

      const newCount = Math.min(row.currentCount + 1, row.requiredCount);
      const nextStatus = newCount >= row.requiredCount ? 'COMPLETED' : 'IN_PROGRESS';

      await client.query(
        `UPDATE user_missions
         SET current_count = $1,
             status = $2,
             completed_at = CASE
               WHEN $2 = 'COMPLETED' AND completed_at IS NULL THEN NOW()
               ELSE completed_at
             END,
             updated_at = NOW()
         WHERE id = $3`,
        [newCount, nextStatus, row.userMissionId]
      );

      missionUpdated = true;
      logger.info(
        `[MissionWorker] user=${input.userId} mission=${row.userMissionId} progress=${newCount}/${row.requiredCount}`
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (missionUpdated) {
    await invalidateMissionCache(input.userId).catch((error: any) => {
      logger.warn(`[MissionWorker] Mission cache invalidation failed for user ${input.userId}: ${error.message}`);
    });
  }
}

async function processMissionEvent(
  job: Job<TradeCreatedMissionEvent | ArticleReadMissionEvent>
): Promise<void> {
  if (job.name === 'trade_created') {
    const payload = job.data as TradeCreatedMissionEvent;
    const tradePayload: Record<string, string> = {
      action: payload.action,
      symbol: payload.symbol.toUpperCase(),
    };

    if (payload.sector) {
      tradePayload.sector = payload.sector;
    }

    await updateMissionProgress({
      userId: payload.userId,
      eventId: String(job.id || `trade-${payload.tradeId}`),
      eventType: 'trade_created',
      eventTime: payload.eventTime,
      payload: tradePayload,
    });
    return;
  }

  if (job.name === 'article_read') {
    const payload = job.data as ArticleReadMissionEvent;

    await updateMissionProgress({
      userId: payload.userId,
      eventId: String(job.id || `article-read-${payload.userId}-${payload.articleId}`),
      eventType: 'article_read',
      eventTime: payload.eventTime,
      payload: {
        article_tag: payload.articleTag,
      },
    });
    return;
  }

  logger.warn(`[MissionWorker] Unknown mission event: ${job.name}`);
}

export const missionProgressWorker = new Worker(
  'mission-event-queue',
  processMissionEvent,
  {
    connection: { url: env.REDIS_URL },
    concurrency: 10,
  }
);

missionProgressWorker.on('completed', (job) => {
  logger.info(`Mission worker: job ${job.id} completed`);
});

missionProgressWorker.on('failed', (job, error) => {
  logger.error(`Mission worker: job ${job?.id} failed:`, error.message);
});

missionProgressWorker.on('error', (error) => {
  logger.error('Mission worker error:', error);
});
