import { Request, Response, Router } from 'express';
import requireAuth from '../middleware/auth';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import {
  ensureActiveUserMissions,
  getMissionCacheKey,
  listActiveUserMissions,
  MISSION_CACHE_TTL_SECONDS,
} from '../services/mission.service';
import { getServerUtcDate, getWeekMondayUtc } from '../utils/time.utils';
import { claimMissionReward } from '../services/mission-reward.service';

const router = Router();

router.use(requireAuth);

router.get('/missions', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.id as string | undefined;

  if (!userId) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  const cacheKey = getMissionCacheKey(userId);

  try {
    const cachedMissions = await redis.get(cacheKey);
    if (cachedMissions) {
      res.status(200).json({
        data: JSON.parse(cachedMissions),
        meta: {
          source: 'redis',
          serverUtcDate: getServerUtcDate(),
        },
      });
      return;
    }

    const todayUtc = getServerUtcDate();
    const mondayUtc = getWeekMondayUtc(todayUtc);

    await ensureActiveUserMissions(userId, todayUtc, mondayUtc);

    const missions = await listActiveUserMissions(userId, todayUtc, mondayUtc);

    await redis.set(cacheKey, JSON.stringify(missions), 'EX', MISSION_CACHE_TTL_SECONDS);

    res.status(200).json({
      data: missions,
      meta: {
        source: 'database',
        serverUtcDate: todayUtc,
        weekMondayUtc: mondayUtc,
      },
    });
  } catch (error: any) {
    logger.error(`[MissionRoute] GET /missions failed for user ${userId}: ${error.message}`);
    res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
});

router.post('/missions/:userMissionId/claim', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.id as string | undefined;
  const userMissionId = String(req.params.userMissionId);

  if (!userId) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  try {
    const result = await claimMissionReward(userMissionId, userId);

    if (result.alreadyClaimed) {
      res.status(200).json({
        data: {
          xpAwarded: 0,
          badgeAwarded: null,
          freezeAwarded: 0,
          freezeCapReached: false,
        },
        meta: {
          idempotent: true,
        },
      });
      return;
    }

    res.status(200).json({
      data: {
        xpAwarded: result.xpAwarded,
        badgeAwarded: result.badgeAwarded,
        freezeAwarded: result.freezeAwarded,
        freezeCapReached: result.freezeCapReached,
      },
      meta: {
        idempotent: false,
      },
    });
  } catch (error: any) {
    if (error.message === 'MISSION_NOT_COMPLETED') {
      res.status(400).json({ success: false, error: 'MISSION_NOT_COMPLETED' });
      return;
    }

    if (error.message === 'USER_MISSION_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'USER_MISSION_NOT_FOUND' });
      return;
    }

    logger.error(`[MissionRoute] POST /missions/${userMissionId}/claim failed for user ${userId}: ${error.message}`);
    res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
