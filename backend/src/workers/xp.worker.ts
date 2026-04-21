import { Worker, Job } from 'bullmq';
import { awardXp, XP_RULES } from '../services/xp.service';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// BullMQ Bağlantı Formatı (ioredis instance DEĞİL, obje formatı)
const connection = { url: env.REDIS_URL };

export interface XpEventJobData {
  userId: string;
  eventType: string;
  metadata?: any;
  ipAddress?: string;
}

export const xpWorker = new Worker<XpEventJobData>(
  'xp-event-queue',
  async (job: Job) => {
    const { userId, eventType, metadata, ipAddress } = job.data;

    if (!job.id) {
      throw new Error('Job ID missing, cannot enforce idempotency');
    }

    logger.info(`[XP Worker] Processing job ${job.id} for user ${userId}, event: ${eventType}`);

    // Servisteki anomali kontrolü ip'yi metadata üzerinden okuduğu için mapliyoruz.
    const enrichedMetadata = {
      ...metadata,
      ip: ipAddress || metadata?.ip || '0.0.0.0',
    };

    // job.id -> idempotencyKey uyumu
    const rule = XP_RULES[ eventType ];
    const xpAmount = rule ? rule.xp : 0;
    const result = await awardXp(userId, eventType, xpAmount, enrichedMetadata, job.id);

    return result;
  },
  {
    connection,
    concurrency: 5,
  }
);

xpWorker.on('failed', (job, err) => {
  logger.error(`[XP Worker] Job ${job?.id} failed: ${err.message}`);
});