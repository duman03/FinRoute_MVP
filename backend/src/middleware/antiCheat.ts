import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export const xpAntiCheat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Auth middleware'den veya request body'den user_id'yi yakalıyoruz
    const userId = (req as any).user?.id || req.body?.user_id || req.body?.userId;
    
    if (!userId) {
      next();
      return;
    }

    // P-03 RL-01 Redis Key: rl:user:<userId>:xp:minutely
    const key = `rl:user:${userId}:xp:minutely`;
    
    // Atomik INCR ve EXPIRE (ioredis eval API uyumlu)
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], 60)
      end
      return current
    `;

    const currentCount = await redis.eval(luaScript, 1, key) as number;

    if (currentCount > 10) {
      logger.warn(`[AntiCheat] HARD BLOCK - User: ${userId}, Rate: ${currentCount}/min`);
      res.status(429).json({ 
        success: false, 
        error: 'TOO_MANY_REQUESTS', 
        message: 'Anti-cheat triggered: Limit exceeded.' 
      });
      return;
    }

    if (currentCount >= 6 && currentCount <= 10) {
      logger.warn(`[AntiCheat] SOFT FLAG - User: ${userId}, Rate: ${currentCount}/min`);
      const reason = `High XP action rate: ${currentCount} actions/min`;
      // anomaly_log tablosuna soft flag kaydı (Migration 013 ile gelecek)
      const query = `INSERT INTO anomaly_log (user_id, reason, created_at) VALUES ($1, $2, NOW())`;
      await pool.query(query, [userId, reason]).catch(err => {
        logger.error(`[AntiCheat] DB Insert Error: ${err.message}`);
      });
    }

    next();
  } catch (error: any) {
    logger.error(`[AntiCheat] Middleware Error: ${error.message}`);
    next(); // Fail-open stratejisi: Redis çökse bile ana işlemler devam etsin
  }
};

export async function logAnomaly(userId: string, actionType: string, score: number, flags: any = {}) {
  try {
    const query = `INSERT INTO anomaly_log (user_id, action_type, anomaly_score, flags, created_at) VALUES ($1, $2, $3, $4, NOW())`;
    await pool.query(query, [userId, actionType, score, JSON.stringify(flags)]);
  } catch (err: any) {
    logger.error(`[AntiCheat] logAnomaly DB Error: ${err.message}`);
  }
}