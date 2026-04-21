import { useState, useCallback, useEffect } from 'react';
import { useGamificationStore } from '../store/gamificationStore';
import { getGamificationProfile, getActiveMissions, getLeaderboard } from '../api/gamification.api';

/**
 * Combined hook to fetch all gamification related data (Profile, Missions, Leaderboard info)
 */
export function useGamification() {
  const {
    streakInfo,
    xpProfile,
    activeMissions,
    setActiveMissions,
    setXpProfile,
    loadGamificationProfile, // This one already updates streak + xp
  } = useGamificationStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Get Profile (Updates Store: streakInfo, xpProfile, recentEvents)
      await loadGamificationProfile();

      // 2. Get Active Missions
      const missions = await getActiveMissions();
      setActiveMissions(missions);

      // 3. Get Leaderboard (To update currentLeague in store if needed)
      // Note: Backend profile also returns leagueSlug now, but let's be safe
      const leaderboard = await getLeaderboard('league', 1);
      useGamificationStore.setState({ currentLeague: leaderboard.leagueSlug });

    } catch (err: any) {
      console.error('[useGamification] fetchAll failed:', err);
      setError(err.message || 'Veriler alınırken bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, [loadGamificationProfile, setActiveMissions]);

  // Initial load
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    streak: streakInfo,
    xpProfile,
    activeMissions,
    isLoading,
    error,
    fetchAll,
  };
}
