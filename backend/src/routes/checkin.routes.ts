import { Router, Request, Response } from 'express';
import authenticateToken from '../middleware/auth';
import { pool } from '../config/database';
import { redis } from '../config/redis';
import { logAnomaly } from '../middleware/antiCheat';
import { awardXp } from '../services/xp.service';
import { logger } from '../utils/logger';
import { calculateStreakUpdate } from '../services/streak.service';
import { getServerUtcDate, nextUtcMidnightUnix } from '../utils/time.utils';

const router = Router();

router.post('/check-in', authenticateToken, async (req: Request, res: Response) => {
  // auth middleware üzerinden gelen user bilgisi
  const userId = (req as any).user?.id as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Transaction için client'ı en dışta tanımlıyoruz (finally bloğunda serbest bırakabilmek için)
  let client;

  try {
    // Adım 1: Sunucu UTC tarihini al (getServerUtcDate())
    const todayUtc = getServerUtcDate();

    // Adım 2: RL-03 Rolling TTL (v2 FIX #1)
    const rlKey = `rl:user:${userId}:checkin:daily`;
    const midnightUnix = nextUtcMidnightUnix();

    // Lua script: KEYS[1] ve ARGV[1] ile atomik işlem
    const RL03_LUA = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIREAT', KEYS[1], ARGV[1])
      end
      return current
    `;

    // ioredis eval çağrısı (Golden Rule #5)
    const rlCount = await redis.eval(RL03_LUA, 1, rlKey, String(midnightUnix)) as number;
    if (rlCount > 2) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }

    // Adım 3: Kalıcı kilit kontrolü (Golden Rule #5: exists returns number)
    const checkinKey = `streak:checkin:${userId}:${todayUtc}`;
    const checkinExists = await redis.exists(checkinKey);
    if (checkinExists === 1) {
      return res.status(409).json({ error: 'ALREADY_CHECKED_IN' });
    }

    // Adım 4: Pending Key (v2 FIX #3 — Aşama 1/2)
    const pendingKey = `streak:pending:${userId}`;
    const pendingAcquired = await redis.set(pendingKey, '1', 'EX', 45, 'NX');
    if (pendingAcquired !== 'OK') {
      return res.status(409).json({ error: 'OPERATION_IN_PROGRESS' });
    }

    // Adım 5: Anomali (Fire and Forget)
    const now = new Date();
    const utcHour = now.getUTCHours();
    if (utcHour >= 2 && utcHour < 4) {
      logAnomaly(userId, 'STREAK_CHECKIN_NIGHT', 2, { 'F-03': true }).catch((err: any) => {
        logger.error(`logAnomaly failed for user ${userId}: ${err.message}`);
      });
    }

    // Adım 6: PostgreSQL Transaction Başlıyor
    client = await pool.connect();
    await client.query('BEGIN');

    const streakRes = await client.query(
      'SELECT current_streak, longest_streak, last_check_in_date, freeze_count FROM user_streaks WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    let currentStreak = 0;
    let longestStreak = 0;
    let lastCheckInDate: string | null = null;
    let freezeCount = 1; // Default

    // Golden Rule #1: Boşluklu parantez
    if (streakRes.rows[ 0 ]) {
      const row = streakRes.rows[ 0 ];
      currentStreak = row.current_streak;
      longestStreak = row.longest_streak;
      if (row.last_check_in_date) {
        const dateObj = new Date(row.last_check_in_date);
        lastCheckInDate = dateObj.toISOString().slice(0, 10);
      }
      freezeCount = row.freeze_count;
    }

    const result = calculateStreakUpdate(
      currentStreak,
      longestStreak,
      lastCheckInDate,
      todayUtc,
      freezeCount
    );

    // Idempotency (Already Checked In)
    if (result.alreadyCheckedIn === true) {
      await client.query('ROLLBACK');
      await redis.set(checkinKey, '1', 'EX', 93600, 'NX');
      await redis.del(pendingKey);

      return res.status(200).json({
        data: {
          currentStreak,
          longestStreak,
          freezeRemaining: freezeCount,
          lastCheckInDate: lastCheckInDate || todayUtc,
          freezeConsumed: false,
          streakReset: false,
          xpBonusAwarded: false,
          checkedInAt: now.toISOString()
        },
        meta: {
          serverUtcDate: todayUtc,
          timeTravelProtected: true,
          idempotent: true
        }
      });
    }

    // UPSERT user_streaks
    await client.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_check_in_date, freeze_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           current_streak = EXCLUDED.current_streak,
           longest_streak = EXCLUDED.longest_streak,
           last_check_in_date = EXCLUDED.last_check_in_date,
           freeze_count = EXCLUDED.freeze_count,
           updated_at = NOW()`,
      [userId, result.newStreak, result.longestStreak, todayUtc, result.freezeRemaining]
    );

    // INSERT daily_check_ins
    await client.query(
      `INSERT INTO daily_check_ins (user_id, check_in_date, check_in_ts, streak_at_checkin, freeze_consumed)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (user_id, check_in_date) DO NOTHING`,
      [userId, todayUtc, result.newStreak, result.freezeConsumed]
    );

    // DB İşlemleri Başarılı!
    await client.query('COMMIT');

    // Mükerrer kilitler temizlenir
    await redis.set(checkinKey, '1', 'EX', 93600, 'NX');
    await redis.del(pendingKey);

    // Adım 7: XP-05 Streak Bonusu (Hafta 6 Dökümanı Kural #6 ve Adım 7'ye %100 Uygun)
    let xpBonusAwarded = false;
    if (result.xpBonusEligible) {
      try {
        const idempotencyKey = `streak-bonus-${userId}-${todayUtc}`;

        // Dökümanda istenen 5 parametre: userId, eventType, xpAmount, metadata, idempotencyKey
        const xpRes = await awardXp(
          userId,
          'STREAK_BONUS',
          10, // 3. parametre: XP miktarı
          { streak: result.newStreak, date: todayUtc },
          idempotencyKey
        );

        // Dökümanda istenen dönüş tipi
        xpBonusAwarded = xpRes.awarded;
      } catch (xpErr: any) {
        logger.error(`awardXp failed for user ${userId}: ${xpErr.message}`);
      }
    }

    // Adım 8: Streak info cache güncelle
    const streakInfo = {
      currentStreak: result.newStreak,
      longestStreak: result.longestStreak,
      freezeRemaining: result.freezeRemaining,
      lastCheckInDate: todayUtc
    };
    await redis.set(`streak:info:${userId}`, JSON.stringify(streakInfo), 'EX', 300);

    return res.status(200).json({
      data: {
        currentStreak: result.newStreak,
        longestStreak: result.longestStreak,
        freezeRemaining: result.freezeRemaining,
        lastCheckInDate: todayUtc,
        freezeConsumed: result.freezeConsumed,
        streakReset: result.streakReset,
        xpBonusAwarded,
        checkedInAt: now.toISOString()
      },
      meta: {
        serverUtcDate: todayUtc,
        timeTravelProtected: true,
        idempotent: false
      }
    });

  } catch (error: any) {
    if (client) {
      await client.query('ROLLBACK').catch(() => { });
    }
    logger.error(`POST /check-in error: ${error.message}`);
    const pendingKey = `streak:pending:${userId}`;
    await redis.del(pendingKey).catch(() => { });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/streak', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const todayUtc = getServerUtcDate();
    const cacheKey = `streak:info:${userId}`;

    // Redis cache-first
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      const parsedData = JSON.parse(cachedData);

      return res.status(200).json({
        data: {
          currentStreak: parsedData.currentStreak,
          longestStreak: parsedData.longestStreak,
          lastCheckInDate: parsedData.lastCheckInDate,
          freezeRemaining: parsedData.freezeRemaining,
          checkedInToday: parsedData.lastCheckInDate === todayUtc
        },
        meta: {
          source: "redis_cache",
          generatedAt: new Date().toISOString()
        }
      });
    }

    // PostgreSQL fallback
    const result = await pool.query(
      'SELECT current_streak, longest_streak, last_check_in_date, freeze_count FROM user_streaks WHERE user_id = $1',
      [userId]
    );

    let currentStreak = 0;
    let longestStreak = 0;
    let lastCheckInDate: string | null = null;
    let freezeRemaining = 1; // Default

    // Golden Rule #1
    if (result.rows[ 0 ]) {
      const row = result.rows[ 0 ];
      currentStreak = row.current_streak;
      longestStreak = row.longest_streak;
      if (row.last_check_in_date) {
        const dateObj = new Date(row.last_check_in_date);
        lastCheckInDate = dateObj.toISOString().slice(0, 10);
      }
      freezeRemaining = row.freeze_count;
    }

    const streakInfo = { currentStreak, longestStreak, freezeRemaining, lastCheckInDate };

    // Cache'e yaz
    await redis.set(cacheKey, JSON.stringify(streakInfo), 'EX', 300);

    return res.status(200).json({
      data: { ...streakInfo, checkedInToday: lastCheckInDate === todayUtc },
      meta: { source: "database", generatedAt: new Date().toISOString() }
    });
  } catch (error: any) {
    logger.error(`GET /streak error: ${error.message}`);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
