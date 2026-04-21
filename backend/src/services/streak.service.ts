import { calcDaysDiff } from '../utils/time.utils';

export { calcDaysDiff, getServerUtcDate, nextUtcMidnightUnix } from '../utils/time.utils';

// Bu dosya saf fonksiyonlar icerir - DB/Redis import ETMEZ
// (pool/redis sadece route ve worker katmaninda kullanilir)

export interface StreakCalculationResult {
  newStreak: number;
  longestStreak: number;
  freezeConsumed: boolean;
  freezeRemaining: number;
  streakReset: boolean;
  streakContinued: boolean;
  xpBonusEligible: boolean;
  alreadyCheckedIn: boolean;
}

export function calculateStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  lastCheckInDate: string | null,
  todayUtc: string,
  freezeCount: number
): StreakCalculationResult {
  const result: StreakCalculationResult = {
    newStreak: currentStreak,
    longestStreak,
    freezeConsumed: false,
    freezeRemaining: freezeCount,
    streakReset: false,
    streakContinued: false,
    xpBonusEligible: false,
    alreadyCheckedIn: false,
  };

  if (lastCheckInDate === null) {
    result.newStreak = 1;
  } else {
    const daysDiff = calcDaysDiff(lastCheckInDate, todayUtc);

    if (daysDiff === 0) {
      result.alreadyCheckedIn = true;
      return result;
    }

    if (daysDiff === 1) {
      result.newStreak = currentStreak + 1;
      result.streakContinued = true;
    } else if (daysDiff === 2 && freezeCount > 0) {
      result.newStreak = currentStreak + 1;
      result.freezeConsumed = true;
      result.freezeRemaining = freezeCount - 1;
      result.streakContinued = true;
    } else {
      result.newStreak = 1;
      result.streakReset = true;
    }
  }

  if (result.newStreak > longestStreak) {
    result.longestStreak = result.newStreak;
  }

  if (result.newStreak > 0 && result.newStreak % 3 === 0) {
    result.xpBonusEligible = true;
  }

  return result;
}
