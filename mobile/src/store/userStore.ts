import { create } from 'zustand';
import { fetchUserProfile, UserProfileResponse } from '../api/userService';

interface UserState {
  profile: UserProfileResponse | null;
  loading: boolean;
  error: string | null;
  loadUserProfile: () => Promise<void>;
  updateLocally: (updates: Partial<UserProfileResponse>) => void;
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  loading: false,
  error: null,

  loadUserProfile: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchUserProfile();
      set({ profile: data, loading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch user profile', loading: false });
    }
  },

  updateLocally: (updates) => {
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...updates } : null,
    }));
  },
}));
