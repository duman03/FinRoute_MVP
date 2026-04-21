import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/authStore';

// Akıllı okuyucu (Web vs Mobil)
const getItem = async (key: string) => {
  if (Platform.OS === 'web') {
    return await AsyncStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

// Emulator veya fiziksel cihaz kullanımı için default adresler
const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const axiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Concurrent refresh request'ler için kuyruk (failedQueue pattern)
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string | null) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ─── REQUEST INTERCEPTOR ─────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Zustand hook'una dışarıdan güvenli erişim
    const { accessToken } = useAuthStore.getState();

    // Axios 1.x versiyonlarında headers nesnesinin varlığını garanti altına alıyoruz
    config.headers = config.headers || {};

    if (accessToken) {
      // Modern Axios set metodu ile güvenli atama
      config.headers.set('Authorization', `Bearer ${accessToken}`);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── RESPONSE INTERCEPTOR ────────────────────────────────────
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Eğer 401 aldıysak ve daha önce retry yapılmadıysa
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Sonsuz döngüyü engellemek için flag atayalım
      originalRequest._retry = true;

      if (isRefreshing) {
        // Eğer zaten refresh işlemi devam ediyorsa, kuyruğa ekle ve bekle
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            if (token) {
              originalRequest.headers.set('Authorization', `Bearer ${token}`);
            }
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // Refresh işlemini biz başlatıyoruz
      isRefreshing = true;

      const { setAuth, signalLogout, userId } = useAuthStore.getState();
      const refreshToken = await getItem('refreshtoken');

      if (!refreshToken) {
        processQueue(error, null);
        isRefreshing = false;
        signalLogout();
        return Promise.reject(error);
      }

      try {
        // Refresh token ile yeni token al (Döngüye girmemek için ham axios kullanıyoruz)
        const refreshResponse = await axios.post(`${baseURL}/auth/refresh`, {
          refreshToken,
        });

        const newAccessToken = refreshResponse.data?.accessToken || refreshResponse.data?.data?.accessToken;

        if (!newAccessToken) {
          throw new Error('No access token returned from server');
        }

        // Store'u güncelle
        if (userId) {
          await setAuth({ accessToken: newAccessToken, refreshToken, userId });
        } else {
          // Çok nadir bir durum (token var ama user yok), güvenli çıkış
          signalLogout();
          return Promise.reject(new Error('User ID missing during refresh'));
        }

        // Kuyruktaki bütün işlemlerin beklemesini tamamla ve yeni token'ı onlara ilet
        processQueue(null, newAccessToken);
        isRefreshing = false;

        // Orijinal isteğin token'ını güncelle ve tekrarla
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);

        return axiosInstance(originalRequest);

      } catch (refreshError: any) {
        // Yenileme başarısız!
        processQueue(refreshError, null);
        isRefreshing = false;
        signalLogout();

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);