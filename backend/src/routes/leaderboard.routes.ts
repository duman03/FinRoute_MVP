import { Request, Response, Router } from 'express';
import requireAuth from '../middleware/auth';
import { getLeaderboard, getUserRank } from '../services/leaderboard.service';
import { getCurrentLeagueSlug } from '../services/league.service';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);

router.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.id as string | undefined;
  const typeParam = String(req.query.type || 'league');
  const type = typeParam === 'global' ? 'global' : typeParam === 'league' ? 'league' : null;
  const requestedLimit = Number(req.query.limit || 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100))
    : 50;

  if (!userId) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  if (!type) {
    res.status(400).json({ success: false, error: 'INVALID_LEADERBOARD_TYPE' });
    return;
  }

  try {
    const leagueSlug = await getCurrentLeagueSlug(userId);
    const [entries, myRank] = await Promise.all([
      getLeaderboard(type, leagueSlug, limit),
      getUserRank(userId, type, leagueSlug),
    ]);

    res.status(200).json({
      data: {
        entries,
        leagueSlug: type === 'league' ? leagueSlug : null,
        myRank,
        type,
      },
      meta: {
        count: entries.length,
        generatedAt: new Date().toISOString(),
        limit,
      },
    });
  } catch (error: any) {
    logger.error(`LeaderboardRoute error for user ${userId}: ${error.message}`);
    res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
