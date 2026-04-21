import { Queue, QueueEvents } from 'bullmq';
import { env } from './env';
import { logger } from '../utils/logger';

// BullMQ Redis connection options — derived from REDIS_URL
const connection = { url: env.REDIS_URL };

// Main trade queue
export const tradeQueue = new Queue('trade-queue', { connection });

// Queue events listener (for monitoring job completion / failure)
export const tradeQueueEvents = new QueueEvents('trade-queue', { connection });

tradeQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Trade job ${jobId} completed`);
});

tradeQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Trade job ${jobId} failed: ${failedReason}`);
});

// Gamification (XP) event queue
export const xpEventQueue = new Queue('xp-event-queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
});

export const missionEventQueue = new Queue('mission-event-queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});
