import { Job, Queue, Worker } from 'bullmq';
import { pool } from '../config/database';
import { env } from '../config/env';
import { getServerUtcDate } from '../utils/time.utils';
import { enqueueNotification, NotificationPayload } from './notification.job';
import { logger } from '../utils/logger';

const connection = { url: env.REDIS_URL };

// ── BullMQ Kuyruğu ────────────────────────────────────────────────────────────
export const streakReminderQueue = new Queue('streak-reminder-q', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: { count: 48 },
    removeOnFail: false,
  },
});

// ── Cron Kaydı ────────────────────────────────────────────────────────────────
export async function scheduleStreakReminderCron(): Promise<void> {
  await streakReminderQueue.add(
    'tick',
    {},
    {
      repeat: { pattern: '0 * * * *', tz: 'UTC' },
      jobId: 'streak-reminder-hourly',
    },
  );
  logger.info('[StreakReminder] Saatlik cron kayıtlı ✅');
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
export const streakReminderWorker = new Worker(
  'streak-reminder-q',
  async (_job: Job) => handleTick(),
  { connection, concurrency: 1 },
);

// ── Çekirdek Algoritma: Smart Timezone ────────────────────────────────────────
/*
 * Yerel Saat = (UTC Saati + offset_saat) mod 24
 * (offset_saat = ROUND(timezone_offset_minutes / 60))
 *
 * Hedef pencere: 19:00 ≤ yerel saat ≤ 20:59  →  local_hour IN (19, 20)
 *
 * SQL'de: ((utcHour + ROUND(offset/60)) % 24) BETWEEN 19 AND 20
 *
 * Gece 03:00'e bildirim atmama kuralı:
 *   Pencere yalnızca 19–20 olduğu için, bir kullanıcının gece 03:00 yerel
 *   saatinde bildirim alması matematiksel olarak imkânsızdır.
 */
async function handleTick(): Promise<void> {
  const nowUtc = new Date();
  const utcHour = nowUtc.getUTCHours();
  const todayUtc = getServerUtcDate();

  logger.info(
    `[StreakReminder] Tick UTC ${String(utcHour).padStart(2, '0')}:00 → yerel 19:00-20:59 penceresi taranıyor`
  );

  const res = await pool.query<{
    user_id: string;
    device_token: string;
    display_name: string;
  }>(
    `
    SELECT
      u.id             AS user_id,
      u.device_token,
      u.display_name
    FROM users u
    -- Bugün check-in yapmamış kullanıcılar (LEFT JOIN + IS NULL pattern)
    LEFT JOIN daily_check_ins dc
      ON  dc.user_id       = u.id
      AND dc.check_in_date = $2::DATE
    WHERE
      dc.user_id IS NULL                           -- Bugün giriş YOK
      AND u.device_token      IS NOT NULL          -- Expo push token mevcut
      AND u.notifications_enabled = TRUE           -- Etik Opt-In kontrolü
      AND u.is_active = TRUE                       -- Aktif kullanıcılar

      -- Akıllı Zamanlama: yerel saat 19:00-20:59 penceresinde mi?
      AND (
        (($1::INTEGER + ROUND(u.timezone_offset_minutes::NUMERIC / 60))::INTEGER % 24 + 24) % 24
      ) BETWEEN 19 AND 20
    `,
    [utcHour, todayUtc],
  );

  if (!res.rows[ 0 ]) {
    logger.info(`[StreakReminder] UTC ${utcHour}:00 — uygun kullanıcı yok.`);
    return;
  }

  logger.info(`[StreakReminder] ${res.rowCount} kullanıcıya bildirim kuyruğa alınıyor...`);

  let queued = 0;
  const targetUsers = res.rows;
  for (const row of targetUsers) {
    const payload: NotificationPayload = {
      userId: row.user_id,
      deviceToken: row.device_token,
      type: 'STREAK_RESCUE',
      title: '🔥 Serini Kurtar!',
      body: `${row.display_name}, bugün henüz giriş yapmadın. Streakini koru!`,
      data: { screen: 'checkin', todayUtc },
    };

    const accepted = await enqueueNotification(payload, todayUtc);
    if (accepted) queued++;
  }

  logger.info(`[StreakReminder] ✅ ${queued}/${res.rowCount} bildirim kuyruğa alındı.`);
}

streakReminderWorker.on('failed', (job, err) =>
  logger.error(`[StreakReminderWorker] Job ${job?.id} başarısız: ${err.message}`)
);
