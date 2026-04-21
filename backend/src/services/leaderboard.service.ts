import { pool } from '../config/database';
import { redis } from '../config/redis';
import type { LeagueSlug } from './league.service';
import { getCurrentLeagueWeekStart } from './league.service';

export const LEAGUE_LB_TTL_SECONDS = 8 * 24 * 60 * 60;

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  score: number;
  displayName: string;
}

export interface UserRank {
  rank: number | null;
  score: number | null;
}

export interface FrozenLeaderboardEntry {
  userId: string;
  score: number;
  joinedAt: Date;
}

async function getDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const userResult = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [userIds]
  );

  const { rows: users } = userResult;
  const mappedUsers = users;
  return new Map(mappedUsers.map((row) => [row.id, row.display_name]));
}

function parseZSetWithScores(raw: string[]): Array<{ userId: string; score: number }> {
  const entries: Array<{ userId: string; score: number }> = [];

  for (let index = 0; index < raw.length; index += 2) {
    const userId = raw[index];
    const score = Number(raw[index + 1] || 0);

    entries.push({ userId, score });
  }

  return entries;
}

export function getGlobalLeaderboardKey(): string {
  return 'lb:global';
}

export function getLeagueLeaderboardKey(
  leagueSlug: LeagueSlug,
  weekStart: string
): string {
  return `lb:league:${leagueSlug}:${weekStart}`;
}

export async function getUserTotalXp(userId: string): Promise<number> {
  const result = await pool.query<{ total_xp: string }>(
    `SELECT COALESCE(SUM(xp), 0)::TEXT AS total_xp
     FROM xp_events
     WHERE user_id = $1`,
    [userId]
  );

  return Number(result.rows[ 0 ]?.total_xp || '0');
}

export async function writeLeaderboardScores(
  userId: string,
  totalXp: number,
  leagueSlug: LeagueSlug,
  weekStart: string = getCurrentLeagueWeekStart()
): Promise<void> {
  const leagueKey = getLeagueLeaderboardKey(leagueSlug, weekStart);
  const pipeline = redis.pipeline();

  pipeline.zadd(getGlobalLeaderboardKey(), totalXp, userId);
  pipeline.zadd(leagueKey, totalXp, userId);
  pipeline.expire(leagueKey, LEAGUE_LB_TTL_SECONDS);

  await pipeline.exec();
}

export async function updateLeaderboard(
  userId: string,
  totalXp: number,
  leagueSlug: LeagueSlug
): Promise<void> {
  await writeLeaderboardScores(userId, totalXp, leagueSlug);
}

export async function getLeaderboard(
  type: 'global' | 'league',
  leagueSlug: LeagueSlug,
  limit: number
): Promise<LeaderboardEntry[]> {
  const weekStart = getCurrentLeagueWeekStart();
  if (type === 'league') {
    const frozenEntries = await freezeLeagueSnapshot(leagueSlug, weekStart);
    const limitedEntries = frozenEntries.slice(0, limit);
    const nameMap = await getDisplayNameMap(limitedEntries.map((entry) => entry.userId));

    return limitedEntries.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      score: entry.score,
      displayName: nameMap.get(entry.userId) || 'Anonim',
    }));
  }

  const key = getGlobalLeaderboardKey();

  const rawEntries = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
  const parsedEntries = parseZSetWithScores(rawEntries);

  if (parsedEntries.length === 0) {
    return [];
  }

  const nameMap = await getDisplayNameMap(parsedEntries.map((entry) => entry.userId));

  return parsedEntries.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    score: entry.score,
    displayName: nameMap.get(entry.userId) || 'Anonim',
  }));
}

export async function getUserRank(
  userId: string,
  type: 'global' | 'league',
  leagueSlug: LeagueSlug
): Promise<UserRank> {
  if (type === 'league') {
    const frozenEntries = await freezeLeagueSnapshot(leagueSlug, getCurrentLeagueWeekStart());
    const entryIndex = frozenEntries.findIndex((entry) => entry.userId === userId);

    if (entryIndex === -1) {
      return {
        rank: null,
        score: null,
      };
    }

    return {
      rank: entryIndex + 1,
      score: frozenEntries[entryIndex].score,
    };
  }

  const weekStart = getCurrentLeagueWeekStart();
  const key = getGlobalLeaderboardKey();

  const [rankRaw, scoreRaw] = await Promise.all([
    redis.zrevrank(key, userId),
    redis.zscore(key, userId),
  ]);

  return {
    rank: rankRaw !== null ? rankRaw + 1 : null,
    score: scoreRaw !== null ? Number(scoreRaw) : null,
  };
}

export async function freezeLeagueSnapshot(
  leagueSlug: LeagueSlug,
  weekStart: string
): Promise<FrozenLeaderboardEntry[]> {
  const rawEntries = await redis.zrevrange(
    getLeagueLeaderboardKey(leagueSlug, weekStart),
    0,
    -1,
    'WITHSCORES'
  );
  const parsedEntries = parseZSetWithScores(rawEntries);

  if (parsedEntries.length === 0) {
    return [];
  }

  const userIds = parsedEntries.map((entry) => entry.userId);
  const assignmentResult = await pool.query<{ user_id: string; created_at: Date }>(
    `SELECT user_id, created_at
     FROM user_league_assignments
     WHERE user_id = ANY($1::uuid[])
       AND week_start = $2::DATE
       AND league_slug = $3`,
    [userIds, weekStart, leagueSlug]
  );

  const { rows: assignments } = assignmentResult;
  const allAssignments = assignments;
  const joinedAtMap = new Map(
    allAssignments.map((row) => [row.user_id, new Date(row.created_at)])
  );

  const mergedEntries = parsedEntries.map((entry) => ({
    userId: entry.userId,
    score: entry.score,
    joinedAt: joinedAtMap.get(entry.userId) || new Date(8640000000000000),
  }));

  mergedEntries.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.joinedAt.getTime() - right.joinedAt.getTime();
  });

  return mergedEntries;
}
