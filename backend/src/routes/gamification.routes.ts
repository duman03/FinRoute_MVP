import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { redis } from '../config/redis';
import { getLevelForXp, getLevelProgressPercent, LEVEL_DEFINITIONS } from '../config/levels';
import requireAuth from '../middleware/auth';
import { logger } from '../utils/logger';
import { getServerUtcDate, getWeekMondayUtc } from '../utils/time.utils';
import { StreakInfo, XpProfile } from '../types/gamification.types';

const router = Router();

router.use(requireAuth);

// D16-A + D43 (Week 10): GET /api/v1/gamification/profile
// Frontend beklentisi: { streakInfo, xpProfile } birlikte döner.
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    const cacheKey = `gamification:profile:${userId}`;
    const cachedProfile = await redis.get(cacheKey);

    // Cache hit
    if (cachedProfile) {
      res.status(200).json(JSON.parse(cachedProfile));
      return;
    }

    const todayUtc = getServerUtcDate();
    const mondayUtc = getWeekMondayUtc(todayUtc);

    // Paralel sorgular: XP + Weekly XP + Streak + Son aktiviteler
    const [xpResult, weeklyXpResult, streakResult, recentEventsResult] = await Promise.all([
      pool.query(
        'SELECT COALESCE(SUM(xp), 0) AS total_xp FROM xp_events WHERE user_id = $1',
        [userId]
      ),
      pool.query(
        'SELECT COALESCE(SUM(xp), 0) AS weekly_xp FROM xp_events WHERE user_id = $1 AND created_at >= $2',
        [userId, mondayUtc]
      ),
      pool.query(
        `SELECT current_streak, longest_streak, last_check_in_date, freeze_count
         FROM user_streaks WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT source, xp, created_at AS "createdAt"
         FROM xp_events WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [userId]
      ),
    ]);

    const totalXp = parseInt(xpResult.rows[ 0 ].total_xp, 10);
    const weeklyXp = parseInt(weeklyXpResult.rows[ 0 ].weekly_xp, 10);
    const { rows: recentEvents } = recentEventsResult;

    // XP Profile (Seviye Motoru)
    const currentLevel = getLevelForXp(totalXp);
    const nextLevel = LEVEL_DEFINITIONS.find(l => l.level === currentLevel.level + 1) || null;

    // Streak Info
    let streakInfo: StreakInfo = {
      currentStreak: 0,
      longestStreak: 0,
      freezeRemaining: 1,
      lastCheckInDate: null,
      todayCheckedIn: false,
    };

    if (streakResult.rows[ 0 ]) {
      const s = streakResult.rows[ 0 ];
      let lastDateFormatted: string | null = null;
      if (s.last_check_in_date) {
        lastDateFormatted = new Date(s.last_check_in_date).toISOString().slice(0, 10);
      }

      streakInfo = {
        currentStreak: s.current_streak,
        longestStreak: s.longest_streak,
        freezeRemaining: s.freeze_count,
        lastCheckInDate: lastDateFormatted,
        todayCheckedIn: lastDateFormatted === todayUtc,
      };
    }

    const xpProfile: XpProfile = {
      totalXp,
      weeklyXp,
      level: currentLevel.level,
    };

    const responseData = {
      success: true,
      data: {
        streakInfo,
        xpProfile,
        recentEvents,
        // UI support: additional calculated fields
        levelName: currentLevel.title,
        nextLevelXp: nextLevel?.minXp ?? totalXp,
        currentLevelXp: currentLevel.minXp,
      },
    };

    // Cache: 60s TTL
    await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60);

    res.status(200).json(responseData);
  } catch (error: any) {
    logger.error(`[Gamification API] Profile fetch error for user: ${error.message}`);
    res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
