import { create } from 'zustand';
import { getGamificationProfile } from '../api/gamification.api';
import { StreakInfo, XpProfile, RecentEvent, Mission, LeaderboardResponse } from '../types/gamification.types';

interface GamificationState {
  streakInfo: StreakInfo | null;
  xpProfile: XpProfile | null;
  activeMissions: Mission[];
  currentLeague: string | null;
  leaderboard: LeaderboardResponse | null;
  recentEvents: RecentEvent[];
  loading: boolean;
  error: string | null;
  setStreak: (s: StreakInfo) => void;
  setActiveMissions: (missions: Mission[] | ((m: Mission[]) => Mission[])) => void;
  setXpProfile: (p: XpProfile) => void;
  setLeaderboard: (l: LeaderboardResponse) => void;
  loadGamificationProfile: () => Promise<void>;
}

export const useGamificationStore = create<GamificationState>((set) => ({
  streakInfo: null,
  xpProfile: null,
  activeMissions: [],
  currentLeague: null,
  leaderboard: null,
  recentEvents: [],
  loading: false,
  error: null,

  setStreak: (streakInfo) => set({ streakInfo }),

  setActiveMissions: (update) =>
    set((state) => ({
      activeMissions: typeof update === 'function' ? update(state.activeMissions) : update,
    })),

  setXpProfile: (xpProfile) => set({ xpProfile }),

  setLeaderboard: (leaderboard) => set({ leaderboard }),

  loadGamificationProfile: async () => {
    set({ loading: true, error: null });
    try {
      const { streakInfo, xpProfile, recentEvents, ...rest } = await getGamificationProfile() as any;
      set({
        streakInfo,
        xpProfile: { ...xpProfile, ...rest },
        recentEvents: recentEvents || [],
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch gamification profile', loading: false });
    }
  },
}));
