import { pool } from '../config/database';
import { getServerUtcDate, getWeekMondayUtc } from '../utils/time.utils';

export const LEAGUE_SLUGS = ['bronze', 'silver', 'gold', 'diamond'] as const;
export type LeagueSlug = typeof LEAGUE_SLUGS[number];
export type LeagueResult = 'PROMOTED' | 'RELEGATED' | 'STAYED';

export function getCurrentLeagueWeekStart(): string {
  return getWeekMondayUtc(getServerUtcDate());
}

export function getNextWeekMonday(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function getClosingLeagueWeekStart(referenceDate: Date = new Date()): string {
  const previousDay = new Date(referenceDate.getTime() - 86_400_000);
  return getWeekMondayUtc(previousDay.toISOString().slice(0, 10));
}

export async function getCurrentLeagueSlug(userId: string): Promise<LeagueSlug> {
  const weekStart = getCurrentLeagueWeekStart();

  const insertResult = await pool.query<{ league_slug: LeagueSlug }>(
    `INSERT INTO user_league_assignments (user_id, league_slug, week_start)
     VALUES ($1, 'bronze', $2::DATE)
     ON CONFLICT (user_id, week_start) DO NOTHING
     RETURNING league_slug`,
    [userId, weekStart]
  );

  if (insertResult.rows[ 0 ]) {
    return insertResult.rows[ 0 ].league_slug;
  }

  const existingResult = await pool.query<{ league_slug: LeagueSlug }>(
    `SELECT league_slug
     FROM user_league_assignments
     WHERE user_id = $1 AND week_start = $2::DATE`,
    [userId, weekStart]
  );

  return existingResult.rows[ 0 ]?.league_slug || 'bronze';
}

export async function getAdjacentLeagueSlug(
  client: { query: (text: string, params?: any[]) => Promise<{ rows: Array<{ slug: LeagueSlug }> }> },
  currentLeagueSlug: LeagueSlug,
  result: LeagueResult
): Promise<LeagueSlug> {
  if (result === 'STAYED') {
    return currentLeagueSlug;
  }

  const offset = result === 'PROMOTED' ? 1 : -1;
  const nextLeagueResult = await client.query(
    `SELECT slug
     FROM leagues
     WHERE tier_order = (
       SELECT tier_order
       FROM leagues
       WHERE slug = $1
     ) + $2`,
    [currentLeagueSlug, offset]
  );

  return nextLeagueResult.rows[ 0 ]?.slug || currentLeagueSlug;
}
