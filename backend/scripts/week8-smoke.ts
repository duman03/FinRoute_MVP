import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/database';
import { redis } from '../src/config/redis';
import { leaderboardSyncQueue } from '../src/jobs/leaderboard-sync.job';
import { leaguePromotionQueue, runLeaguePromotionForWeek } from '../src/jobs/league-promotion.job';
import {
  freezeLeagueSnapshot,
  getGlobalLeaderboardKey,
  getLeaderboard,
  getLeagueLeaderboardKey,
  getUserRank,
  LEAGUE_LB_TTL_SECONDS,
} from '../src/services/leaderboard.service';
import {
  getCurrentLeagueSlug,
  getCurrentLeagueWeekStart,
  LEAGUE_SLUGS,
  type LeagueSlug,
} from '../src/services/league.service';
import { awardXp } from '../src/services/xp.service';

interface SmokeUser {
  accessToken: string;
  displayName: string;
  email: string;
  refreshToken: string;
  userId: string;
}

interface ScoreState {
  global: number | null;
  league: number | null;
}

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const USERS_FILE = path.join(ROOT_DIR, 'artifacts', 'week8-smoke-users.json');
const REPORT_FILE = path.join(ROOT_DIR, 'artifacts', 'week8-smoke-report.json');
const API_BASE_URL = process.env.WEEK8_API_BASE_URL || 'http://localhost:3001/api/v1';
const SMOKE_USER_PASSWORD = 'Week8Pass1';
const PROMOTION_SMOKE_USERS = [
  { createdAt: '2099-01-05T00:00:01.000Z', displayName: 'Promo One', email: 'week8.promo.one@finroute.test', score: 500, userId: '10000000-0000-4000-8000-000000000001' },
  { createdAt: '2099-01-05T00:00:02.000Z', displayName: 'Promo Two', email: 'week8.promo.two@finroute.test', score: 400, userId: '20000000-0000-4000-8000-000000000002' },
  { createdAt: '2099-01-05T00:00:03.000Z', displayName: 'Promo Three', email: 'week8.promo.three@finroute.test', score: 300, userId: '30000000-0000-4000-8000-000000000003' },
  { createdAt: '2099-01-05T00:00:04.000Z', displayName: 'Promo Four', email: 'week8.promo.four@finroute.test', score: 200, userId: '40000000-0000-4000-8000-000000000004' },
  { createdAt: '2099-01-05T00:00:05.000Z', displayName: 'Promo Five', email: 'week8.promo.five@finroute.test', score: 100, userId: '50000000-0000-4000-8000-000000000005' },
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureUsersFile(): SmokeUser[] {
  if (!fs.existsSync(USERS_FILE)) {
    throw new Error(`Smoke users file not found: ${USERS_FILE}`);
  }

  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) as SmokeUser[];
}

async function waitForScores(
  userId: string,
  leagueSlug: LeagueSlug,
  expectedScore: number,
  timeoutMs: number = 15_000
): Promise<ScoreState> {
  const startedAt = Date.now();
  const globalKey = getGlobalLeaderboardKey();
  const leagueKey = getLeagueLeaderboardKey(leagueSlug, getCurrentLeagueWeekStart());

  while (Date.now() - startedAt < timeoutMs) {
    const [globalScoreRaw, leagueScoreRaw] = await Promise.all([
      redis.zscore(globalKey, userId),
      redis.zscore(leagueKey, userId),
    ]);

    const scoreState = {
      global: globalScoreRaw !== null ? Number(globalScoreRaw) : null,
      league: leagueScoreRaw !== null ? Number(leagueScoreRaw) : null,
    };

    if (scoreState.global === expectedScore && scoreState.league === expectedScore) {
      return scoreState;
    }

    await sleep(500);
  }

  return {
    global: await redis.zscore(globalKey, userId).then((value) => value !== null ? Number(value) : null),
    league: await redis.zscore(leagueKey, userId).then((value) => value !== null ? Number(value) : null),
  };
}

async function resetSmokeState(users: SmokeUser[], weekStart: string): Promise<void> {
  const userIds = [
    ...users.map((user) => user.userId),
    ...PROMOTION_SMOKE_USERS.map((user) => user.userId),
  ];

  await pool.query('DELETE FROM xp_events WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.query('DELETE FROM user_badges WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.query('DELETE FROM league_reward_log WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.query(
    'DELETE FROM user_league_assignments WHERE user_id = ANY($1::uuid[]) AND week_start = $2::DATE',
    [userIds, weekStart]
  );

  const pipeline = redis.pipeline();
  pipeline.zrem(getGlobalLeaderboardKey(), ...userIds);
  pipeline.del('anomaly:ip:127.0.0.1');

  for (const userId of userIds) {
    pipeline.del(`anomaly:last_action:${userId}`);
    pipeline.del(`anomaly:score:${userId}`);
    pipeline.del(`cap:xp:${userId}`);
    pipeline.del(`claim:xp:${userId}:LESSON_COMPLETED`);
    pipeline.del(`claim:xp:${userId}:LEAGUE_WINNER`);
    pipeline.del(`rl:xp:${userId}`);
    pipeline.del(`xp:profile:${userId}`);
    pipeline.del(`streak:info:${userId}`);
    pipeline.del(`anomaly:task:${userId}:LESSON_COMPLETED`);
    pipeline.del(`anomaly:task:${userId}:LEAGUE_WINNER`);
  }

  for (const leagueSlug of LEAGUE_SLUGS) {
    pipeline.zrem(getLeagueLeaderboardKey(leagueSlug, weekStart), ...userIds);
  }

  await pipeline.exec();
}

async function seedAssignments(users: SmokeUser[]): Promise<{ assignments: Array<{ createdAt: string; displayName: string; leagueSlug: LeagueSlug; userId: string }>; leagueSlug: LeagueSlug }> {
  const assignments: Array<{ createdAt: string; displayName: string; leagueSlug: LeagueSlug; userId: string }> = [];

  for (const user of users) {
    const leagueSlug = await getCurrentLeagueSlug(user.userId);
    const assignmentResult = await pool.query<{ created_at: Date }>(
      `SELECT created_at
       FROM user_league_assignments
       WHERE user_id = $1
         AND week_start = $2::DATE`,
      [user.userId, getCurrentLeagueWeekStart()]
    );

    assignments.push({
      createdAt: assignmentResult.rows[ 0 ].created_at.toISOString(),
      displayName: user.displayName,
      leagueSlug,
      userId: user.userId,
    });

    await sleep(50);
  }

  return {
    assignments,
    leagueSlug: assignments[ 0 ].leagueSlug,
  };
}

async function awardSmokeXp(users: SmokeUser[]): Promise<Array<{ displayName: string; result: unknown; userId: string; xp: number }>> {
  const awards = [
    { eventType: 'LESSON_COMPLETED', user: users[ 0 ], xp: 120 },
    { eventType: 'LESSON_COMPLETED', user: users[ 1 ], xp: 80 },
    { eventType: 'LESSON_COMPLETED', user: users[ 2 ], xp: 80 },
  ];

  const results: Array<{ displayName: string; result: unknown; userId: string; xp: number }> = [];

  for (const award of awards) {
    const result = await awardXp(
      award.user.userId,
      award.eventType,
      award.xp,
      {
        ip: '127.0.0.1',
        scenario: 'week8-smoke',
      },
      `week8-smoke:${award.user.userId}:${award.xp}`
    );

    results.push({
      displayName: award.user.displayName,
      result,
      userId: award.user.userId,
      xp: award.xp,
    });
  }

  return results;
}

async function loginSmokeUser(email: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: SMOKE_USER_PASSWORD,
    }),
  });

  const body = await response.json() as { data?: { accessToken?: string } };
  if (!response.ok || !body.data?.accessToken) {
    throw new Error(`Unable to login smoke user ${email}.`);
  }

  return body.data.accessToken;
}

async function fetchApiLeaderboard(user: SmokeUser, type: 'global' | 'league') {
  const request = async (accessToken: string) => fetch(`${API_BASE_URL}/gamification/leaderboard?type=${type}&limit=10`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let activeAccessToken = user.accessToken;
  let response = await request(activeAccessToken);

  if (response.status === 401) {
    activeAccessToken = await loginSmokeUser(user.email);
    response = await request(activeAccessToken);
  }

  return {
    body: await response.json(),
    status: response.status,
  };
}

async function runSyncUserRecoveryTest(userId: string, expectedScore: number, leagueSlug: LeagueSlug): Promise<ScoreState> {
  const globalKey = getGlobalLeaderboardKey();
  const leagueKey = getLeagueLeaderboardKey(leagueSlug, getCurrentLeagueWeekStart());

  await redis.zadd(globalKey, 5, userId);
  await redis.zadd(leagueKey, 5, userId);

  await leaderboardSyncQueue.add(
    'sync-user',
    { fallbackLeagueSlug: leagueSlug, userId },
    {
      jobId: `week8-sync-user-${userId}-${Date.now()}`,
      removeOnComplete: { count: 20 },
      removeOnFail: false,
    }
  );

  return waitForScores(userId, leagueSlug, expectedScore);
}

async function runFullReconcileRecoveryTest(userId: string, expectedScore: number, leagueSlug: LeagueSlug): Promise<ScoreState> {
  const globalKey = getGlobalLeaderboardKey();
  const leagueKey = getLeagueLeaderboardKey(leagueSlug, getCurrentLeagueWeekStart());

  await redis.zadd(globalKey, 1, userId);
  await redis.zadd(leagueKey, 1, userId);

  await leaderboardSyncQueue.add(
    'full-reconcile',
    { userId: 'system' },
    {
      jobId: `week8-full-reconcile-${Date.now()}`,
      removeOnComplete: { count: 20 },
      removeOnFail: false,
    }
  );

  return waitForScores(userId, leagueSlug, expectedScore);
}

async function runSyntheticTieBreakerScenario(): Promise<{
  rawRedisOrder: string[];
  snapshotOrder: string[];
  syntheticWeekStart: string;
}> {
  const syntheticWeekStart = '2099-01-05';
  const leagueSlug: LeagueSlug = 'bronze';
  const leagueKey = getLeagueLeaderboardKey(leagueSlug, syntheticWeekStart);
  const earlyUserId = '00000000-0000-4000-8000-000000000001';
  const lateUserId = 'ffffffff-ffff-4fff-afff-ffffffffffff';

  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES
       ($1, $2, 'smoke-hash', 'Tie Early'),
       ($3, $4, 'smoke-hash', 'Tie Late')
     ON CONFLICT (id) DO NOTHING`,
    [
      earlyUserId,
      'week8.tie.early@finroute.test',
      lateUserId,
      'week8.tie.late@finroute.test',
    ]
  );

  await pool.query(
    `DELETE FROM user_league_assignments
     WHERE week_start = $1::DATE
       AND user_id = ANY($2::uuid[])`,
    [syntheticWeekStart, [earlyUserId, lateUserId]]
  );

  await redis.del(leagueKey);

  await pool.query(
    `INSERT INTO user_league_assignments (
       user_id,
       league_slug,
       week_start,
       created_at,
       updated_at
     )
     VALUES
       ($1, $2, $3::DATE, '2099-01-05T00:00:01.000Z', '2099-01-05T00:00:01.000Z'),
       ($4, $2, $3::DATE, '2099-01-05T00:00:02.000Z', '2099-01-05T00:00:02.000Z')
     ON CONFLICT (user_id, week_start) DO UPDATE
       SET league_slug = EXCLUDED.league_slug,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
    [earlyUserId, leagueSlug, syntheticWeekStart, lateUserId]
  );

  await redis.zadd(leagueKey, 100, earlyUserId);
  await redis.zadd(leagueKey, 100, lateUserId);
  await redis.expire(leagueKey, LEAGUE_LB_TTL_SECONDS);

  const rawRedisOrder = await redis.zrevrange(leagueKey, 0, -1);
  const snapshot = await freezeLeagueSnapshot(leagueSlug, syntheticWeekStart);

  return {
    rawRedisOrder,
    snapshotOrder: snapshot.map((entry) => entry.userId),
    syntheticWeekStart,
  };
}

async function runSyntheticPromotionScenario(): Promise<{
  nextWeekAssignments: Array<{ league_slug: string; user_id: string }>;
  rewardLogCount: number;
  syntheticWeekStart: string;
  weeklyResults: Array<{ final_rank: number | null; final_xp: number | null; result: string | null; user_id: string }>;
  winnerBadges: Array<{ badge_slug: string; user_id: string }>;
}> {
  const syntheticWeekStart = '2099-01-05';
  const nextWeekStart = '2099-01-12';
  const leagueSlug: LeagueSlug = 'bronze';
  const promotionUsers = PROMOTION_SMOKE_USERS;
  const leagueKey = getLeagueLeaderboardKey(leagueSlug, syntheticWeekStart);
  const userIds = promotionUsers.map((user) => user.userId);

  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     SELECT *
     FROM UNNEST(
       $1::uuid[],
       $2::text[],
       $3::text[],
       $4::text[]
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      userIds,
      promotionUsers.map((user) => user.email),
      promotionUsers.map(() => 'smoke-hash'),
      promotionUsers.map((user) => user.displayName),
    ]
  );

  await pool.query('DELETE FROM xp_events WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.query('DELETE FROM user_badges WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.query('DELETE FROM league_reward_log WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pool.query(
    'DELETE FROM user_league_assignments WHERE user_id = ANY($1::uuid[]) AND week_start IN ($2::DATE, $3::DATE)',
    [userIds, syntheticWeekStart, nextWeekStart]
  );
  await redis.del(leagueKey);

  await pool.query(
    `INSERT INTO user_league_assignments (
       user_id,
       league_slug,
       week_start,
       created_at,
       updated_at
     )
     SELECT *
     FROM UNNEST(
       $1::uuid[],
       $2::text[],
       $3::date[],
       $4::timestamptz[],
       $5::timestamptz[]
     )
     ON CONFLICT (user_id, week_start) DO UPDATE
       SET league_slug = EXCLUDED.league_slug,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
    [
      userIds,
      promotionUsers.map(() => leagueSlug),
      promotionUsers.map(() => syntheticWeekStart),
      promotionUsers.map((user) => user.createdAt),
      promotionUsers.map((user) => user.createdAt),
    ]
  );

  const pipeline = redis.pipeline();

  for (const user of promotionUsers) {
    pipeline.zadd(leagueKey, user.score, user.userId);
  }

  pipeline.expire(leagueKey, LEAGUE_LB_TTL_SECONDS);
  await pipeline.exec();

  await runLeaguePromotionForWeek(syntheticWeekStart);

  const weeklyResults = await pool.query<{
    final_rank: number | null;
    final_xp: number | null;
    result: string | null;
    user_id: string;
  }>(
    `SELECT user_id, final_rank, final_xp, result
     FROM user_league_assignments
     WHERE week_start = $1::DATE
       AND user_id = ANY($2::uuid[])
     ORDER BY final_rank ASC`,
    [syntheticWeekStart, userIds]
  );

  const nextWeekAssignments = await pool.query<{ league_slug: string; user_id: string }>(
    `SELECT user_id, league_slug
     FROM user_league_assignments
     WHERE week_start = $1::DATE
       AND user_id = ANY($2::uuid[])
     ORDER BY user_id ASC`,
    [nextWeekStart, userIds]
  );

  const rewardLogCountResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM league_reward_log
     WHERE week_start = $1::DATE
       AND user_id = ANY($2::uuid[])`,
    [syntheticWeekStart, userIds]
  );

  const winnerBadges = await pool.query<{ badge_slug: string; user_id: string }>(
    `SELECT user_id, badge_slug
     FROM user_badges
     WHERE user_id = ANY($1::uuid[])
     ORDER BY badge_slug ASC`,
    [userIds]
  );

  return {
    nextWeekAssignments: nextWeekAssignments.rows,
    rewardLogCount: Number(rewardLogCountResult.rows[ 0 ].count),
    syntheticWeekStart,
    weeklyResults: weeklyResults.rows,
    winnerBadges: winnerBadges.rows,
  };
}

async function main(): Promise<void> {
  const users = ensureUsersFile();
  const weekStart = getCurrentLeagueWeekStart();

  await resetSmokeState(users, weekStart);

  const seededAssignments = await seedAssignments(users);
  const awardResults = await awardSmokeXp(users);
  const leagueEntries = await getLeaderboard('league', seededAssignments.leagueSlug, 10);
  const globalEntries = await getLeaderboard('global', seededAssignments.leagueSlug, 10);
  const bravoRank = await getUserRank(users[ 1 ].userId, 'league', seededAssignments.leagueSlug);
  const snapshot = await freezeLeagueSnapshot(seededAssignments.leagueSlug, weekStart);
  const leagueApi = await fetchApiLeaderboard(users[ 0 ], 'league');
  const globalApi = await fetchApiLeaderboard(users[ 0 ], 'global');
  const syncRepair = await runSyncUserRecoveryTest(users[ 1 ].userId, 80, seededAssignments.leagueSlug);
  const reconcileRepair = await runFullReconcileRecoveryTest(users[ 2 ].userId, 80, seededAssignments.leagueSlug);
  const syntheticTieBreaker = await runSyntheticTieBreakerScenario();
  const syntheticPromotion = await runSyntheticPromotionScenario();
  const leaderboardRepeatJobs = await leaderboardSyncQueue.getRepeatableJobs();
  const leagueRepeatJobs = await leaguePromotionQueue.getRepeatableJobs();

  const report = {
    api: {
      global: globalApi,
      league: leagueApi,
    },
    awards: awardResults,
    currentWeekStart: weekStart,
    leagueEntries,
    leagueSlug: seededAssignments.leagueSlug,
    leagueUserRank: {
      displayName: users[ 1 ].displayName,
      userId: users[ 1 ].userId,
      value: bravoRank,
    },
    globalEntries,
    repeatableJobs: {
      leaderboard: leaderboardRepeatJobs,
      leaguePromotion: leagueRepeatJobs,
    },
    repairs: {
      fullReconcile: reconcileRepair,
      syncUser: syncRepair,
    },
    seededAssignments: seededAssignments.assignments,
    snapshot,
    syntheticPromotion,
    syntheticTieBreaker,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      leaderboardSyncQueue.close(),
      leaguePromotionQueue.close(),
      redis.quit(),
      pool.end(),
    ]);

    process.exit(process.exitCode || 0);
  });
