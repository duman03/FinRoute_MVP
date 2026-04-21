import { pool } from '../config/database';
import { redis } from '../config/redis';

export const MISSION_CACHE_TTL_SECONDS = 60;

export interface ActiveMission {
  userMissionId: string;
  missionId: string;
  slug: string;
  title: string;
  description: string;
  missionType: 'DAILY' | 'WEEKLY';
  targetEvent: string;
  periodDate: string;
  currentCount: number;
  requiredCount: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'REWARD_CLAIMED';
  completedAt: string | null;
  claimedAt: string | null;
  rewardXp: number;
  rewardBadge: string | null;
  rewardFreeze: number;
}

export function getMissionCacheKey(userId: string): string {
  return `mission:active:${userId}`;
}

export async function invalidateMissionCache(userId: string): Promise<void> {
  await redis.del(getMissionCacheKey(userId));
}

export async function ensureActiveUserMissions(
  userId: string,
  todayUtc: string,
  mondayUtc: string
): Promise<void> {
  await pool.query(
    `INSERT INTO user_missions (user_id, mission_id, period_date, required_count)
     SELECT
       $1,
       m.id,
       CASE
         WHEN m.mission_type = 'DAILY' THEN $2::DATE
         WHEN m.mission_type = 'WEEKLY' THEN $3::DATE
       END,
       m.required_count
     FROM missions m
     WHERE m.is_active = TRUE
     ON CONFLICT (user_id, mission_id, period_date) DO NOTHING`,
    [userId, todayUtc, mondayUtc]
  );
}

export async function listActiveUserMissions(
  userId: string,
  todayUtc: string,
  mondayUtc: string
): Promise<ActiveMission[]> {
  const result = await pool.query<ActiveMission>(
    `SELECT
       um.id AS "userMissionId",
       m.id AS "missionId",
       m.slug,
       m.title,
       m.description,
       m.mission_type AS "missionType",
       m.target_event AS "targetEvent",
       um.period_date::TEXT AS "periodDate",
       um.current_count AS "currentCount",
       um.required_count AS "requiredCount",
       um.status,
       um.completed_at AS "completedAt",
       um.claimed_at AS "claimedAt",
       m.reward_xp AS "rewardXp",
       m.reward_badge AS "rewardBadge",
       m.reward_freeze AS "rewardFreeze"
     FROM user_missions um
     JOIN missions m ON m.id = um.mission_id
     WHERE um.user_id = $1
       AND (
         (m.mission_type = 'DAILY' AND um.period_date = $2::DATE) OR
         (m.mission_type = 'WEEKLY' AND um.period_date = $3::DATE)
       )
     ORDER BY m.mission_type ASC, m.slug ASC`,
    [userId, todayUtc, mondayUtc]
  );

  const { rows: missionList } = result;
  return missionList;
}
