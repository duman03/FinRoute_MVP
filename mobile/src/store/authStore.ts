import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type AuthStatus = 'AUTHENTICATED' | 'LOGGEDOUT' | 'UNKNOWN';

interface AuthState {
  accessToken: string | null;
  userId: string | null;
  isLoggedIn: boolean;
  user: {
    displayName: string;
    email: string;
  } | null;
  authStatus: AuthStatus;
  setAuth: (params: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    user?: { displayName: string; email: string };
  }) => Promise<void>;
  clearAuth: () => Promise<void>;
  signalLogout: () => void;
  signalAuthenticated: () => void;
  setUserId: (id: string | null) => void;
}

// ─── AKILLI DEPOLAMA YARDIMCISI (WEB vs MOBİL) ───
const saveItem = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const deleteItem = async (key: string) => {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};
// ─────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  userId: null,
  isLoggedIn: false,
  user: null,
  authStatus: 'UNKNOWN',

  setAuth: async ({ accessToken, refreshToken, userId, user }) => {
    // D4-1-B: Cihaza göre güvenli veya normal depolama
    await saveItem('refreshtoken', refreshToken);

    set((state) => ({
      accessToken,
      userId,
      user: user ?? state.user,
      isLoggedIn: true,
      authStatus: 'AUTHENTICATED',
    }));
  },

  clearAuth: async () => {
    // Refresh token'ı sil (Güvenlik)
    await deleteItem('refreshtoken');

    set({
      accessToken: null,
      userId: null,
      user: null,
      isLoggedIn: false,
      authStatus: 'LOGGEDOUT',
    });
  },

  signalLogout: () =>
    set({
      authStatus: 'LOGGEDOUT',
      accessToken: null,
      userId: null,
      user: null,
      isLoggedIn: false,
    }),

  signalAuthenticated: () => set({ authStatus: 'AUTHENTICATED', isLoggedIn: true }),

  setUserId: (id: string | null) => set({ userId: id }),
}));

export const signalLogout = (): void => useAuthStore.getState().signalLogout();
