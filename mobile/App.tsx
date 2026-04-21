import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, DimensionValue } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './src/store/authStore';
import { jwtDecode } from 'jwt-decode';
// Named import kontrolü sağlandı
import { axiosInstance } from './src/api/axiosInstance';
import { useDeviceSetup } from './src/hooks/useDeviceSetup';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { PushNotificationBridge } from './src/components/PushNotificationBridge';

// Akıllı okuyucu (Web vs Mobil)
const getItem = async (key: string) => {
  if (Platform.OS === 'web') {
    return await AsyncStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

// ── Bootstrap Yardımcısı (D4-1 Kuralı) ──────────────────────────────────────
async function bootstrapSession(
  setAuth: (p: { accessToken: string; refreshToken: string; userId: string }) => Promise<void>
): Promise<void> {
  // 🚀 ARTIK AKILLI OKUYUCUYU KULLANIYORUZ
  const storedRefresh = await getItem('refreshtoken');
  if (!storedRefresh) return;

  try {
    const response = await axiosInstance.post('/auth/refresh', {
      refreshToken: storedRefresh
    });

    const newAccessToken = response.data?.data?.accessToken ?? response.data?.accessToken;
    if (newAccessToken) {
      try {
        // JWT içindeki 'sub' (User UUID) bilgisini çekiyoruz
        const decoded = jwtDecode<{ sub: string }>(newAccessToken);
        
        // Store'daki userId'yi güncelliyoruz ki Lig sekmesi bizi mor boyasın!
        useAuthStore.getState().setUserId(decoded.sub);

        await setAuth({
          accessToken: newAccessToken,
          refreshToken: storedRefresh,
          userId: decoded.sub || '',
        });

        console.log('[Auth Bootstrap] Kimlik doğrulandı:', decoded.sub);
      } catch (err) {
        console.error('[Auth Bootstrap] Token decode hatası:', err);
      }
    }
  } catch (err) {
    console.warn('Bootstrap session fail:', err);
  }
}

// ── Ana Bileşen ─────────────────────────────────────────────────────────────
export default function App() {
  // Cihaz ve font kurulumlarını başlat (Selçuklu Mühendisliği Standardı)
  useDeviceSetup();

  const { authStatus, setAuth, clearAuth } = useAuthStore();
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // EC-14: Logout sinyali geldiğinde (örneğin interceptor 401 yakaladığında)
  // state'i temizle ve login ekranına fırlat.
  useEffect(() => {
    if (authStatus === 'LOGGEDOUT') {
      clearAuth();
    }
  }, [authStatus, clearAuth]);

  // D4-1: Uygulama her açıldığında mevcut oturumu kurtarmayı dene
  useEffect(() => {
    bootstrapSession(setAuth)
      .catch(() => {
        // Refresh başarısız veya token yok
      })
      .finally(() => setIsBootstrapping(false));
  }, [setAuth]);

  // ── Splash / Loading ──────────────────────────────────────────────────────
  if (isBootstrapping) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color="#4F46E5" size="large" />
      </View>
    );
  }

  // ── Ana Uygulama (RootNavigator handles Auth Switch) ───────────────────
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <PushNotificationBridge />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: (Platform.OS === 'web' ? '100vh' : '100%') as DimensionValue,
    width: '100%',
    backgroundColor: '#F9FAFB',
  },
  splash: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
