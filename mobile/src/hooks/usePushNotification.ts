import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { registerDeviceToken as saveDeviceToken, removeDeviceToken } from '../api/userService';

const TOKEN_TTL_MS = 60 * 60 * 1000;

function getExpoProjectId(): string {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    throw new Error('Expo EAS projectId is required for push notifications');
  }

  return projectId;
}

async function registerDeviceToken(): Promise<void> {
  const { authStatus, accessToken } = useAuthStore.getState();

  if (authStatus !== 'AUTHENTICATED' || !accessToken) {
    return;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'FinRoute Bildirimleri',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
        showBadge: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      await removeDeviceToken().catch(() => undefined);
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: getExpoProjectId(),
    });
    const deviceToken = tokenData.data;

    await saveDeviceToken(deviceToken);
  } catch (err: unknown) {
    console.warn('[PushNotification] Token kayıt hatası (non-fatal):', err);
  }
}

export function usePushNotification(): void {
  const authStatus = useAuthStore((state) => state.authStatus);
  const accessToken = useAuthStore((state) => state.accessToken);
  const lastRegisteredAt = useRef<number>(0);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED' || !accessToken) {
      return;
    }

    registerDeviceToken().then(() => {
      lastRegisteredAt.current = Date.now();
    });

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const now = Date.now();
        const bgDuration = backgroundedAt.current != null
          ? now - backgroundedAt.current
          : Infinity;

        if (bgDuration >= TOKEN_TTL_MS) {
          registerDeviceToken().then(() => {
            lastRegisteredAt.current = Date.now();
          });
        }

        backgroundedAt.current = null;
      } else if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAt.current = Date.now();
      }
    });

    return () => subscription.remove();
  }, [accessToken, authStatus]);
}
