import { redis } from '../config/redis';
import { pool } from '../config/database';
import { enqueueSyncUser } from '../jobs/leaderboard-sync.job';
import { getCurrentLeagueSlug } from './league.service';
import { getUserTotalXp, updateLeaderboard } from './leaderboard.service';
import { logger } from '../utils/logger';

// ─── KURAL TABLOSU ──────────────────────────────────────────────
export type XpLimitType = 'daily' | 'weekly' | 'once' | 'none';

export interface XpRule {
  xp: number;
  limit: XpLimitType;
}

export const XP_RULES: Record<string, XpRule> = {
  'TRADE_EXECUTED': { xp: 20, limit: 'daily' },
  'LESSON_COMPLETED': { xp: 50, limit: 'none' }, // Idempotency limitler
  'PORTFOLIO_DIVERSIFIED': { xp: 30, limit: 'weekly' },
  'FIRST_TRADE_EVER': { xp: 100, limit: 'once' },
  // D21: Hafta 6 Streak Bonusu Eklendi
  'STREAK_BONUS': { xp: 10, limit: 'daily' },
  'LEAGUE_WINNER': { xp: 0, limit: 'none' },
  'MISSION_COMPLETED': { xp: 0, limit: 'daily' },
};

const DAILY_XP_CAP = 200;

// ─── ADIM 1: Rate Limit (Lua) ────────────────────────────────────
export async function checkXpRateLimit(userId: string): Promise<boolean> {
  const key = `rl:xp:${userId}`;
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], 60)
    end
    return current
  `;
  
  const currentCount = await redis.eval(luaScript, 1, key) as number;
  return currentCount <= 30; // Dakikada maksimum 30 XP event'i (Güvenlik Payı)
}

// ─── ADIM 2: Anomali Skoru (Zafiyet 1 Fix) ───────────────────────
export async function evaluateAnomalyScore(userId: string, eventType: string, ip: string, xpToAward: number): Promise<number> {
  let scoreToAdd = 0;
  const now = Date.now();

  // F-01: İki işlem arası < 3 saniye
  const lastActionKey = `anomaly:last_action:${userId}`;
  const lastAction = await redis.get(lastActionKey);
  if (lastAction && (now - parseInt(lastAction, 10) < 3000)) {
    scoreToAdd += 3;
  }
  await redis.set(lastActionKey, now.toString(), 'EX', 3600); // multi kaldırıldı, düz await

  // F-02: Aynı görev 1 günde > 2 kez
  const taskKey = `anomaly:task:${userId}:${eventType}`;
  const taskCount = await redis.incr(taskKey);
  if (taskCount === 1) await redis.expire(taskKey, 86400); 
  if (taskCount > 2) {
    scoreToAdd += 5;
  }

  // F-04: Aynı IP'den > 3 farklı hesap
  const ipKey = `anomaly:ip:${ip}`;
  await redis.sadd(ipKey, userId);
  await redis.expire(ipKey, 86400);
  const ipCount = await redis.scard(ipKey);
  if (ipCount > 3) {
    scoreToAdd += 8;
  }

  // F-05: Günlük XP > ortalamanın 5x
  const currentDailyXp = parseInt(await redis.get(`cap:xp:${userId}`) || '0', 10);
  if (currentDailyXp + xpToAward > DAILY_XP_CAP * 1.5) { 
    scoreToAdd += 6;
  }

  // Skor arttıysa DB log işlemleri
  if (scoreToAdd > 0) {
    const scoreKey = `anomaly:score:${userId}`;
    const totalScore = await redis.incrby(scoreKey, scoreToAdd);
    await redis.expire(scoreKey, 86400);

    if (totalScore >= 10 && (totalScore - scoreToAdd) < 10) {
      const query = `INSERT INTO anomaly_log (user_id, action_type, anomaly_score, created_at) VALUES ($1, $2, $3, NOW())`;
      // Dökümandaki action_type kolon adına göre uyarlandı
      await pool.query(query, [userId, 'ANOMALY_THRESHOLD_REACHED', totalScore]).catch(err => {
        logger.error(`[Anomaly] DB Insert Error: ${err.message}`);
      });
    }
    return totalScore;
  }

  const currentScore = await redis.get(`anomaly:score:${userId}`);
  return currentScore ? parseInt(currentScore, 10) : 0;
}

// ─── ANA XP MOTORU (Hafta 6 Dökümanına %100 Sadık İmza) ──────────
export async function awardXp(
  userId: string,
  eventType: string,
  xpAmount: number, // 3. Parametre: XP Miktarı eklendi
  metadata: Record<string, unknown>,
  idempotencyKey: string
): Promise<{ awarded: boolean; reason?: string; xp?: number }> {
  const rule = XP_RULES[eventType];
  if (!rule) {
    throw new Error(`Unknown XP event type: ${eventType}`);
  }

  // 1. Rate Limit (D15-A)
  if (!(await checkXpRateLimit(userId))) {
    logger.warn(`[XP] Rate limit exceeded for user: ${userId}`);
    return { awarded: false, reason: 'RATE_LIMIT_EXCEEDED' };
  }

  // 2. Anomaly Score Check (D15-B)
  const ip = (metadata?.ip as string) || '0.0.0.0';
  const anomalyScore = await evaluateAnomalyScore(userId, eventType, ip, xpAmount);
  
  if (anomalyScore >= 10) {
    logger.warn(`[XP] Anomaly detected (score: ${anomalyScore}) for user: ${userId}`);
    return { awarded: false, reason: 'ANOMALY_DETECTED' };
  }

  // 3. Daily Claim Limit (TOCTOU Fix - ioredis API)
  let claimKey = `claim:xp:${userId}:${eventType}`;
  let claimTtl = 86400;
  if (rule.limit === 'weekly') claimTtl = 86400 * 7;
  if (rule.limit === 'once') claimTtl = 86400 * 365 * 10;
  if (eventType === 'MISSION_COMPLETED') {
    claimKey = `claim:xp:${userId}:${eventType}:${idempotencyKey}`;
  }
  
  if (rule.limit !== 'none') {
    const acquired = await redis.set(claimKey, '1', 'EX', claimTtl, 'NX');
    if (acquired !== 'OK') return { awarded: false, reason: 'LIMIT_REACHED' };
  }

  // 4. Daily XP Cap (Lua Atomik)
  const capKey = `cap:xp:${userId}`;
  if (rule.limit !== 'none') {
    const capScript = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      local added = tonumber(ARGV[1])
      local cap = tonumber(ARGV[3])
      
      if current + added > cap then return -1 end
      
      redis.call('INCRBY', KEYS[1], added)
      if current == 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
      
      return current + added
    `;
    const capResult = await redis.eval(capScript, 1, capKey, xpAmount, 86400, DAILY_XP_CAP);
    
    if (capResult === -1) {
      // Cap aşıldıysa Claim'i geri al (Rollback)
      await redis.del(claimKey);
      return { awarded: false, reason: 'DAILY_CAP_EXCEEDED' };
    }
  }

  // 5. DB Insert (ON CONFLICT DO NOTHING)
  try {
    const query = `
      INSERT INTO xp_events (user_id, xp, source, idempotency_key, metadata)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id
    `;
    const result = await pool.query(query, [userId, xpAmount, eventType, idempotencyKey, JSON.stringify(metadata)]);

    if (result.rowCount === 0) {
      // Idempotent Hit: İşlem önceden yapılmış. Redis'teki limitleri temizle (Rollback)
      if (rule.limit !== 'none') {
        await redis.decrby(capKey, xpAmount);
        await redis.del(claimKey);
      }
      return { awarded: false, reason: 'ALREADY_PROCESSED' };
    }

    const totalXp = await getUserTotalXp(userId);
    await redis.del(`xp:profile:${userId}`).catch(() => {});

    try {
      const leagueSlug = await getCurrentLeagueSlug(userId);
      await updateLeaderboard(userId, totalXp, leagueSlug);
    } catch (leaderboardErr: any) {
      logger.error(`[XP] Leaderboard update failed for user ${userId}: ${leaderboardErr.message}`);

      enqueueSyncUser(userId).catch((syncErr: any) => {
        logger.error(`[XP] Leaderboard sync queue failed for user ${userId}: ${syncErr.message}`);
      });
    }

    return { awarded: true, xp: xpAmount };
  } catch (err: any) {
    // DB Çökerse: Kullanıcının hakkı yanmasın diye Redis'i temizle (Rollback)
    if (rule.limit !== 'none') {
      await redis.decrby(capKey, xpAmount);
      await redis.del(claimKey);
    }
    logger.error(`[XP] Database error for user ${userId}: ${err.message}`);
    throw err; 
  }
}
