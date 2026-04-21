import { axiosInstance } from './axiosInstance'
import type {
  StreakInfo,
  XpProfile,
  Mission,
  LeaderboardResponse,
  CheckInResult,
} from '../types/gamification.types'

/**
 * Fetch the user's gamification profile (XP + Streak)
 */
export async function getGamificationProfile(): Promise<{
  streakInfo: StreakInfo
  xpProfile: XpProfile
}> {
  const res = await axiosInstance.get('/gamification/profile')
  // Backend returns { success: true, data: { streakInfo, xpProfile, ... } }
  return res.data.data
}

/**
 * Fetch active missions for the current user
 */
export async function getActiveMissions(): Promise<Mission[]> {
  const res = await axiosInstance.get('/gamification/missions')
  // Backend returns { success: true, data: Mission[] }
  return res.data.data
}

/**
 * Claim reward for a completed mission
 */
export async function claimMissionReward(
  missionId: string
): Promise<{ xpAwarded: number }> {
  const res = await axiosInstance.post(
    `/gamification/missions/${missionId}/claim`
  )
  // Backend returns { success: true, data: { xpAwarded, ... } }
  return res.data.data
}

/**
 * Perform daily check-in to maintain/advance streak
 * ─── 409 ALREADY_CHECK_IN → idempotent başarı, hata DEĞİL ─────────────────
 */
export async function postCheckIn(): Promise<CheckInResult> {
  try {
    const res = await axiosInstance.post('/gamification/check-in')
    return {
      newStreak: res.data.data.currentStreak,
      xpAwarded: res.data.data.xpBonusAwarded ? 10 : 0, // Simplified based on backend logic
      freezeRemaining: res.data.data.freezeRemaining,
      alreadyCheckedIn: false,
    }
  } catch (err: any) {
    if (
      err?.response?.status === 409 &&
      err?.response?.data?.error === 'ALREADY_CHECKED_IN'
    ) {
      // Backend return value might be limited in 409, fallback to 0 if missing
      return {
        newStreak: err.response.data.currentStreak ?? 0,
        xpAwarded: 0,
        freezeRemaining: err.response.data.freezeRemaining ?? 0,
        alreadyCheckedIn: true,
      }
    }
    throw err
  }
}

/**
 * Fetch leaderboard (Global or League)
 */
export async function getLeaderboard(
  type: 'global' | 'league',
  limit?: number
): Promise<LeaderboardResponse> {
  const res = await axiosInstance.get('/gamification/leaderboard', {
    params: { type, ...(limit !== undefined && { limit }) },
  })
  // Backend returns { success: true, data: { entries, myRank, leagueSlug } }
  return res.data.data
}
