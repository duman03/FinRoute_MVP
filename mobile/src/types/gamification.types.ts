export interface StreakInfo {
  currentStreak: number
  longestStreak: number
  freezeRemaining: number
  lastCheckInDate: string | null
  todayCheckedIn: boolean
}

export interface XpProfile {
  totalXp: number
  weeklyXp: number
  level: number
  levelName?: string
  nextLevelXp?: number
  currentLevelXp?: number
}

export interface Mission {
  id: string
  title: string
  description: string
  progressCount: number
  targetCount: number
  status: 'ACTIVE' | 'COMPLETED' | 'CLAIMED'
  xpReward: number
  badgeSlug: string | null
}

export interface LeaderboardEntry {
  userId: string
  displayName: string
  score: number
  rank: number
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  myRank: number | null
  leagueSlug: string | null
}

export interface RecentEvent {
  source: string
  xp: number
  createdAt: string
}

export interface CheckInResult {
  newStreak: number
  xpAwarded: number
  freezeRemaining: number
  alreadyCheckedIn: boolean
}
