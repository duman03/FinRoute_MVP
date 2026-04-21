import { Job, Queue, Worker } from 'bullmq';
import { pool } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { nextUtcMidnightUnix, getServerUtcDate } from '../utils/time.utils';
import { logger } from '../utils/logger';

// ── Payload Tipi ─────────────────────────────────────────────────────────────
export type NotificationType =
  | 'LEAGUE_PROMOTED'   // "Tebrikler Lige Yükseldin! 🏆"
  | 'STREAK_DANGER'     // "🔥 Serin Bozuluyor!"
  | 'STREAK_RESCUE';    // "Serini Kurtar!" — Smart timezone cron'dan gelir

export interface NotificationPayload {
  userId: string;
  deviceToken: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

const connection = { url: env.REDIS_URL };
const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

class ExpoPushPermanentError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ExpoPushPermanentError';
  }
}

// ── Tür bazlı günlük limit (D1-A: STREAK_RESCUE → 1) ────────────────────────
const DAILY_NOTIF_LIMITS: Record<NotificationType, number> = {
  STREAK_RESCUE: 1,
  STREAK_DANGER: 1,
  LEAGUE_PROMOTED: 2,
};

// ── Redis Lua spam guard (Atomik INCR + EXPIREAT) ─────────────────────────────
// ioredis sözdizimi: redis.eval(script, numKeys, key1, arg1, arg2)
const SPAM_GUARD_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIREAT', KEYS[1], ARGV[1])
  end
  if current > tonumber(ARGV[2]) then
    return 0
  end
  return current
`;

// ── BullMQ Kuyruğu ────────────────────────────────────────────────────────────
export const notificationQueue = new Queue<NotificationPayload>('notification-q', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});

// ── Kuyruğa Alma (Spam korumalı + BullMQ dedup) ──────────────────────────────
export async function enqueueNotification(
  payload: NotificationPayload,
  todayUtcDate: string,  // 'YYYY-MM-DD' — getServerUtcDate()'den gelir
): Promise<boolean> {

  const limit = DAILY_NOTIF_LIMITS[payload.type] ?? 1;
  const spamKey = `notif:rl:${payload.userId}:${payload.type}:${todayUtcDate}`;
  const midnightUnix = nextUtcMidnightUnix();

  // Katman 1 — Redis hız engeli
  const count = await redis.eval(
    SPAM_GUARD_LUA,
    1,
    spamKey,
    midnightUnix.toString(),
    limit.toString(),
  ) as number;

  if (count === 0) {
    logger.warn(
      `[Notification] Redis spam guard: userId=${payload.userId} ` +
      `type=${payload.type} limit=${limit} — atlandı`
    );
    return false;
  }

  // D1-B: Sabit, deterministik jobId → BullMQ deduplication garantisi
  const jobId = `notif:${payload.userId}:${payload.type}:${todayUtcDate}`;

  await notificationQueue.add(payload.type, payload, { jobId });
  return true;
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };

  if (env.EXPO_PUSH_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  }

  return headers;
}

function normalizeExpoTicket(data: unknown): ExpoPushTicket | null {
  if (Array.isArray(data)) {
    return (data[ 0 ] ?? null) as ExpoPushTicket | null;
  }
  return (data ?? null) as ExpoPushTicket | null;
}

function isPermanentExpoError(code: string | undefined): boolean {
  return code === 'DeviceNotRegistered'
    || code === 'MessageTooBig'
    || code === 'InvalidCredentials'
    || code === 'PUSH_TOO_MANY_EXPERIENCE_IDS';
}

async function clearDeviceToken(userId: string, deviceToken: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET device_token = NULL,
         notifications_enabled = FALSE,
         updated_at = NOW()
     WHERE id = $1 AND device_token = $2`,
    [userId, deviceToken]
  );
}

async function sendExpoPush(payload: NotificationPayload): Promise<string | null> {
  if (!payload.deviceToken.startsWith('ExpoPushToken[')
    && !payload.deviceToken.startsWith('ExponentPushToken[')) {
    throw new ExpoPushPermanentError('Invalid Expo push token format', 'InvalidExpoPushToken');
  }

  const response = await fetch(EXPO_PUSH_SEND_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({
      to: payload.deviceToken,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default',
      channelId: 'default',
    }),
  });

  const body = await response.json() as {
    data?: ExpoPushTicket | ExpoPushTicket[];
    errors?: Array<{ message?: string; code?: string }>;
  };

  if (!response.ok) {
    const message = body.errors?.[ 0 ]?.message ?? `Expo Push API failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const ticket = normalizeExpoTicket(body.data);
  if (!ticket) {
    throw new Error('Expo Push API returned no ticket');
  }

  if (ticket.status === 'error') {
    const code = ticket.details?.error;
    const message = ticket.message ?? 'Expo Push API rejected notification';
    if (isPermanentExpoError(code)) {
      throw new ExpoPushPermanentError(message, code);
    }
    throw new Error(message);
  }

  return ticket.id ?? null;
}

async function checkExpoReceipt(
  receiptId: string,
  payload: NotificationPayload
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const response = await fetch(EXPO_PUSH_RECEIPT_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({ ids: [receiptId] }),
  });

  const body = await response.json() as {
    data?: Record<string, ExpoPushReceipt>;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    const message = body.errors?.[ 0 ]?.message ?? `Expo receipt check failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const receipt = body.data?.[ receiptId ];
  if (!receipt || receipt.status === 'ok') {
    return;
  }

  const code = receipt.details?.error;
  if (code === 'DeviceNotRegistered') {
    await clearDeviceToken(payload.userId, payload.deviceToken);
  }

  const message = receipt.message ?? 'Expo receipt returned an error';
  if (isPermanentExpoError(code)) {
    throw new ExpoPushPermanentError(message, code);
  }
  throw new Error(message);
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
export const notificationWorker = new Worker<NotificationPayload>(
  'notification-q',
  async (job: Job<NotificationPayload>) => {
    const { userId, deviceToken, type } = job.data;
    const todayUtc = getServerUtcDate();

    // D1-C: DB katmanı idempotency (ikinci savunma hattı)
    // İki pod aynı anda bu noktaya gelirse ON CONFLICT DO NOTHING biri durdurur.
    const insertRes = await pool.query(
      `INSERT INTO sent_notifications (user_id, notif_type, sent_date, device_token)
       VALUES ($1, $2, $3::DATE, $4)
       ON CONFLICT (user_id, notif_type, sent_date) DO NOTHING`,
      [userId, type, todayUtc, deviceToken],
    );

    // rowCount === 0 → bu bildirim bugün daha önce gönderilmiş
    if ((insertRes.rowCount ?? 0) === 0) {
      logger.info(
        `[NotificationWorker] İdempotent skip: userId=${userId} type=${type} tarih=${todayUtc}`
      );
      return;
    }

    try {
      const receiptId = await sendExpoPush(job.data);
      if (receiptId) {
        await checkExpoReceipt(receiptId, job.data);
      }
    } catch (err) {
      await pool.query(
        `DELETE FROM sent_notifications
         WHERE user_id = $1
           AND notif_type = $2
           AND sent_date = $3::DATE`,
        [userId, type, todayUtc]
      );

      if (err instanceof ExpoPushPermanentError) {
        await clearDeviceToken(userId, deviceToken);
        logger.warn(
          `[NotificationWorker] Permanent Expo push error: userId=${userId} ` +
          `type=${type} code=${err.code ?? 'unknown'}`
        );
        return;
      }

      throw err;
    }

    logger.info(
      `[NotificationWorker] ✅ userId=${userId} type=${type} ` +
      `attempt=${job.attemptsMade + 1}`
    );
  },
  {
    connection,
    concurrency: 10,
    limiter: { max: 100, duration: 60_000 },
  },
);

notificationWorker.on('failed', (job, err) =>
  logger.error(
    `[NotificationWorker] ❌ Job ${job?.id} başarısız ` +
    `(${job?.attemptsMade}/${job?.opts.attempts} deneme): ${err.message}`
  )
);
