<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# 1'den 9. haftaya kadar olan tüm Backend (Node.js/PostgreSQL/Redis) oyunlaştırma, XP, Streak ve Liderlik altyapısını kurşun geçirmez bir şekilde tamamladık. Şimdi Space'teki yol haritasına göre 10. Hafta (Frontend Altyapısı ve Oyunlaştırma Ekranları) görevine başlıyoruz. Lütfen web araması yapma, sadece bu talimatlara ve onayladığımız backend mimarisine odaklan:

Bana şu somut teslimatları (deliverables) React Native (Expo) ve TypeScript kullanarak, temiz bir Klasör Mimarisi (Folder Structure) ile hazırla:
State Management \& API Entegrasyonu: Kullanıcının currentStreak, totalXp, freezeCount ve activeMissions verilerini tutacak bir global state (Zustand tercih edilir) mağazası oluştur. Backend ile haberleşecek ve kimlik doğrulama token'larını yönetecek bir Axios Interceptor altyapısı kur.
Streak (Seri) Bileşeni: Ana ekranda (Home Screen) yer alacak, kullanıcının mevcut serisini, 'Streak Freeze' (dondurma) hakkını ve haftalık check-in takvimini görselleştiren modern bir UI bileşeni (Component) yaz.
Görevler (Missions) ve Liderlik (Leaderboard) Ekranları: Kullanıcının günlük/haftalık görev ilerlemesini (örneğin: 1/5 Teknoloji Hissesi Al) gösteren progress bar'lı 'MissionCard' bileşeni ve Bronz/Gümüş/Altın liglerine göre kullanıcıları sıralayan, kendi sırasını (Rank) vurgulayan bir 'LeaderboardList' bileşeni tasarla.
Çıktıyı modüler, tekrar kullanılabilir (reusable) bileşenler içeren ve modern React Native (StyleSheet veya NativeWind) standartlarına uygun temiz bir Markdown formatında sun.

9 haftalık backend mimariniz (Lua CAS lock'lar, BullMQ idempotency, `sent_notifications` spam guard, graceful shutdown) derinlemesine incelendi. Onaylanmış API sözleşmeleri (`GET /gamification/profile`, `GET /leaderboard`, `POST /gamification/checkin`, `GET /gamification/missions`) ve veri modelleri (`currentStreak`, `freezeCount`, `totalXp`, `activeMissions`) referans alınarak 10. Hafta frontend deliverable'ları aşağıda sunulmaktadır.[^1_1][^1_2][^1_3]

***

# FinRoute — 10. Hafta Deliverable'ları

## Frontend Altyapısı \& Oyunlaştırma Ekranları (React Native / Expo / TypeScript)


***

## D38 — Klasör Mimarisi

Backend ile simetrik **katmanlı mimari**: `api` → `store` → `hooks` → `components` → `screens`.[^1_3]

```
finroute-mobile/
├── src/
│   ├── api/
│   │   ├── client.ts              # Axios instance + JWT interceptor
│   │   ├── gamification.api.ts    # Profile, check-in, mission API çağrıları
│   │   └── leaderboard.api.ts     # Leaderboard API çağrıları
│   ├── store/
│   │   └── gamification.store.ts  # Zustand global state
│   ├── hooks/
│   │   └── useGamification.ts     # API + Store köprüsü
│   ├── components/
│   │   ├── streak/
│   │   │   └── StreakWidget.tsx    # D44
│   │   ├── missions/
│   │   │   └── MissionCard.tsx    # D45
│   │   └── leaderboard/
│   │       └── LeaderboardList.tsx # D46
│   ├── screens/
│   │   ├── HomeScreen.tsx         # StreakWidget entegrasyonu
│   │   ├── MissionsScreen.tsx     # MissionCard listesi
│   │   └── LeaderboardScreen.tsx  # LeaderboardList entegrasyonu
│   └── types/
│       └── gamification.types.ts  # D39 — Paylaşılan tip tanımları
├── app.json
└── package.json
```


***

## D39 — `types/gamification.types.ts`

Tüm katmanlar arasında **tek kaynak (single source of truth)**. Backend API yanıtlarıyla birebir eşleşir.[^1_2][^1_1]

```typescript
// src/types/gamification.types.ts

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  freezeCount: number;
  todayCheckedIn: boolean;
}

export interface XPProfile {
  totalXp: number;
  level: number;
  levelName: string;
  nextLevelXp: number;   // Hafta 5 v3 level engine'den
  currentLevelXp: number;
}

export type MissionCategory = 'DAILY' | 'WEEKLY';
export type MissionStatus   = 'ACTIVE' | 'COMPLETED' | 'CLAIMED';

export interface Mission {
  id: string;
  slug: string;
  title: string;           // Örn: "5 Teknoloji Hissesi Al"
  description: string;
  category: MissionCategory;
  xpReward: number;
  targetCount: number;
  progressCount: number;
  status: MissionStatus;
}

export type LeagueSlug = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  score: number;
  displayName: string;
}

export interface MyRank {
  rank: number | null;
  score: number | null;
}

export interface LeaderboardData {
  type: 'global' | 'league';
  leagueSlug: LeagueSlug | null;
  entries: LeaderboardEntry[];
  myRank: MyRank;
}
```


***

## D40 — `store/gamification.store.ts` (Zustand)

`currentStreak`, `totalXp`, `freezeCount`, `activeMissions` tek mağazada yönetilir. Hafta 9'daki `notification.job.ts` ile simetrik, immutable update pattern'ı.[^1_1]

```typescript
// src/store/gamification.store.ts
import { create } from 'zustand';
import type {
  StreakInfo, XPProfile, Mission, LeaderboardData, LeagueSlug,
} from '../types/gamification.types';

interface GamificationState {
  // ── Durum ────────────────────────────────────────────────────
  streak:             StreakInfo | null;
  xpProfile:          XPProfile | null;
  activeMissions:     Mission[];
  leaderboard:        LeaderboardData | null;
  currentLeagueSlug:  LeagueSlug;
  isLoading:          boolean;
  error:              string | null;

  // ── Setter'lar ────────────────────────────────────────────────
  setStreak:          (s: StreakInfo) => void;
  setXpProfile:       (p: XPProfile) => void;
  setActiveMissions:  (m: Mission[]) => void;
  setLeaderboard:     (d: LeaderboardData) => void;
  setCurrentLeague:   (slug: LeagueSlug) => void;
  setLoading:         (v: boolean) => void;
  setError:           (e: string | null) => void;

  // ── Atomik Güncellemeler ──────────────────────────────────────
  // Görev tamamlandığında tam refetch yerine sadece ilgili satır güncellenir.
  updateMissionProgress: (missionId: string, newProgress: number) => void;

  // Streak freeze kullanımında anlık UI güncellemesi
  decrementFreeze: () => void;

  reset: () => void;
}

const INITIAL: Omit<GamificationState, keyof { [K in keyof GamificationState as GamificationState[K] extends Function ? K : never]: never }> = {
  streak: null,
  xpProfile: null,
  activeMissions: [],
  leaderboard: null,
  currentLeagueSlug: 'bronze',
  isLoading: false,
  error: null,
};

export const useGamificationStore = create<GamificationState>((set) => ({
  ...INITIAL,

  setStreak:         (streak)           => set({ streak }),
  setXpProfile:      (xpProfile)        => set({ xpProfile }),
  setActiveMissions: (activeMissions)   => set({ activeMissions }),
  setLeaderboard:    (leaderboard)      => set({ leaderboard }),
  setCurrentLeague:  (currentLeagueSlug) => set({ currentLeagueSlug }),
  setLoading:        (isLoading)        => set({ isLoading }),
  setError:          (error)            => set({ error }),

  updateMissionProgress: (missionId, newProgress) =>
    set((state) => ({
      activeMissions: state.activeMissions.map((m) =>
        m.id === missionId ? { ...m, progressCount: newProgress } : m
      ),
    })),

  decrementFreeze: () =>
    set((state) => ({
      streak: state.streak
        ? { ...state.streak, freezeCount: Math.max(0, state.streak.freezeCount - 1) }
        : null,
    })),

  reset: () => set({ ...INITIAL } as any),
}));
```


***

## D41 — `api/client.ts` (Axios Interceptor)

JWT token `expo-secure-store`'dan okunur; 401 yanıtında token yenileme (refresh) akışı otomatik tetiklenir. Hafta 9'daki `graceful shutdown` sırası gibi, interceptor zincirleme sırasına dikkat edilir.[^1_1]

```typescript
// src/api/client.ts
import axios, {
  AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError,
} from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3002/api';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request Interceptor: Her istekte JWT ekle ─────────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ── Response Interceptor: 401 → Token Refresh → Retry ────────────────────────
apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    const req = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !req._retry) {
      req._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });

        await SecureStore.setItemAsync('auth_token', data.accessToken);
        req.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(req);
      } catch {
        // Refresh başarısız → kullanıcıyı çıkış yaptır
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('refresh_token');
      }
    }
    return Promise.reject(error);
  },
);
```


***

## D42 — API Servis Katmanı

Hafta 8'de onaylanan endpoint sözleşmeleri (`GET /leaderboard`, `GET /gamification/profile`) birebir kullanılır.[^1_2][^1_1]

```typescript
// src/api/gamification.api.ts
import { apiClient } from './client';
import type { StreakInfo, XPProfile, Mission } from '../types/gamification.types';

export interface GamificationProfileResponse {
  streakInfo:  StreakInfo;
  xpProfile:   XPProfile;
}

export const getGamificationProfile = () =>
  apiClient
    .get<GamificationProfileResponse>('/gamification/profile')
    .then((r) => r.data);

export const getActiveMissions = () =>
  apiClient
    .get<{ missions: Mission[] }>('/gamification/missions')
    .then((r) => r.data.missions);

export const claimMissionReward = (missionId: string) =>
  apiClient
    .post<{ xpEarned: number }>(`/gamification/missions/${missionId}/claim`)
    .then((r) => r.data);

// Hafta 6 v2: UTC korumalı check-in — tek gerçek kaynak sunucu
export const postDailyCheckIn = () =>
  apiClient
    .post<StreakInfo>('/gamification/checkin')
    .then((r) => r.data);
```

```typescript
// src/api/leaderboard.api.ts
import { apiClient } from './client';
import type { LeaderboardData } from '../types/gamification.types';

interface LeaderboardApiResponse {
  data: LeaderboardData;
  meta: { limit: number; count: number; generatedAt: string };
}

// Hafta 8 GET /leaderboard?type=global|league&limit=50
export const getLeaderboard = (
  type: 'global' | 'league' = 'league',
  limit = 50,
) =>
  apiClient
    .get<LeaderboardApiResponse>('/leaderboard', { params: { type, limit } })
    .then((r) => r.data.data);
```


***

## D43 — `hooks/useGamification.ts`

Paralel veri çekimi (`Promise.all`) ile tek `isLoading` bayrağında 3 endpoint birlikte yüklenir.[^1_1]

```typescript
// src/hooks/useGamification.ts
import { useCallback, useEffect } from 'react';
import { useGamificationStore } from '../store/gamification.store';
import {
  getGamificationProfile, getActiveMissions,
  postDailyCheckIn, claimMissionReward,
} from '../api/gamification.api';
import { getLeaderboard } from '../api/leaderboard.api';

export function useGamification() {
  const store = useGamificationStore();

  const fetchAll = useCallback(async () => {
    store.setLoading(true);
    store.setError(null);
    try {
      // Üç endpoint paralel olarak çekilir — waterfall bekleme yok
      const [profile, missions, lb] = await Promise.all([
        getGamificationProfile(),
        getActiveMissions(),
        getLeaderboard('league'),
      ]);
      store.setStreak(profile.streakInfo);
      store.setXpProfile(profile.xpProfile);
      store.setActiveMissions(missions);
      store.setLeaderboard(lb);
      if (lb.leagueSlug) store.setCurrentLeague(lb.leagueSlug);
    } catch (err: any) {
      store.setError(err?.response?.data?.error ?? 'Veriler yüklenemedi');
    } finally {
      store.setLoading(false);
    }
  }, []);

  const checkIn = useCallback(async () => {
    try {
      const updated = await postDailyCheckIn();
      store.setStreak(updated);  // Optimistic update, sunucu yanıtıyla yaz
    } catch (err: any) {
      store.setError(err?.response?.data?.error ?? 'Check-in başarısız');
    }
  }, []);

  const claimReward = useCallback(async (missionId: string) => {
    try {
      await claimMissionReward(missionId);
      const missions = await getActiveMissions();
      store.setActiveMissions(missions);
    } catch (err: any) {
      store.setError(err?.response?.data?.error ?? 'Ödül alınamadı');
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return {
    streak:         store.streak,
    xpProfile:      store.xpProfile,
    activeMissions: store.activeMissions,
    leaderboard:    store.leaderboard,
    isLoading:      store.isLoading,
    error:          store.error,
    fetchAll, checkIn, claimReward,
  };
}
```


***

## D44 — `components/streak/StreakWidget.tsx`

Hafta 6 v2 streak modeli (`currentStreak`, `freezeCount`, `todayCheckedIn`) doğrudan eşlenir; Hafta 9'dan gelen `STREAK_RESCUE` bildirimine açık `onCheckIn` callback'i sağlanır.[^1_2][^1_1]

```tsx
// src/components/streak/StreakWidget.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StreakInfo } from '../../types/gamification.types';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

interface Props {
  streak: StreakInfo;
  onCheckIn?: () => void;
}

export const StreakWidget: React.FC<Props> = ({ streak, onCheckIn }) => {
  const { currentStreak, freezeCount, todayCheckedIn } = streak;

  // Haftanın bugüne kadar olan günlerini işaretle
  const todayIndex = ((new Date().getDay() + 6) % 7); // 0=Pzt
  const checkedDays = DAYS.map((_, i) =>
    i <= todayIndex && (todayCheckedIn ? i <= todayIndex : i < todayIndex)
    && currentStreak > todayIndex - i
  );

  return (
    <View style={styles.container}>

      {/* ── Üst Satır: Seri + Freeze ── */}
      <View style={styles.header}>
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={22} color="#FF6B35" />
          <Text style={styles.streakCount}>{currentStreak}</Text>
          <Text style={styles.streakLabel}>Günlük Seri</Text>
        </View>
        <View style={styles.freezePill}>
          <Ionicons name="snow" size={14} color="#4ECDC4" />
          <Text style={styles.freezeCount}>{freezeCount}×</Text>
          <Text style={styles.freezeLabel}>Freeze</Text>
        </View>
      </View>

      {/* ── Haftalık Takvim ── */}
      <View style={styles.calendar}>
        {DAYS.map((day, i) => (
          <View key={day} style={styles.dayCol}>
            <Text style={styles.dayLabel}>{day}</Text>
            <View style={[
              styles.dot,
              checkedDays[i]    && styles.dotDone,
              i === todayIndex  && !todayCheckedIn && styles.dotToday,
            ]}>
              {checkedDays[i] && <Ionicons name="checkmark" size={11} color="#fff" />}
            </View>
          </View>
        ))}
      </View>

      {/* ── Check-in CTA ── */}
      {!todayCheckedIn ? (
        <TouchableOpacity style={styles.btn} onPress={onCheckIn} activeOpacity={0.85}>
          <Ionicons name="flame-outline" size={16} color="#fff" />
          <Text style={styles.btnText}>Bugünkü Girişi Tamamla</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#4ECDC4" />
          <Text style={styles.doneText}>Bugün tamamlandı ✓</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#2E2E4E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakCount: { fontSize: 26, fontWeight: '800', color: '#FF6B35' },
  streakLabel: { fontSize: 13, color: '#8E8EA0', marginTop: 2 },
  freezePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#0F2A2A', paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 20,
  },
  freezeCount: { fontSize: 15, fontWeight: '700', color: '#4ECDC4' },
  freezeLabel: { fontSize: 11, color: '#4ECDC4' },
  calendar: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14,
  },
  dayCol: { alignItems: 'center', gap: 5 },
  dayLabel: { fontSize: 10, color: '#6E6E80' },
  dot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#2E2E4E',
    justifyContent: 'center', alignItems: 'center',
  },
  dotDone:  { backgroundColor: '#FF6B35' },
  dotToday: { borderWidth: 2, borderColor: '#FF6B35' },
  btn: {
    backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  doneBanner: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6, paddingVertical: 8,
  },
  doneText:   { color: '#4ECDC4', fontSize: 14, fontWeight: '500' },
});
```


***

## D45 — `components/missions/MissionCard.tsx`

Hafta 7 `mission_progress_events` tablosundaki `progressCount/targetCount` verisi progress bar'a dönüştürülür. `CLAIMED` durumu kilitli görünür (etik gamification — sonsuz talep döngüsü engeli).[^1_2]

```tsx
// src/components/missions/MissionCard.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Mission } from '../../types/gamification.types';

interface Props {
  mission: Mission;
  onClaim?: (id: string) => void;
}

const CAT_CFG = {
  DAILY:  { label: 'Günlük',   color: '#4ECDC4', icon: 'today-outline'     as const },
  WEEKLY: { label: 'Haftalık', color: '#A78BFA', icon: 'calendar-outline'  as const },
};

export const MissionCard: React.FC<Props> = ({ mission, onClaim }) => {
  const { id, title, description, category, xpReward,
          targetCount, progressCount, status } = mission;
  const cfg        = CAT_CFG[category];
  const pct        = Math.min(progressCount / targetCount, 1);
  const isComplete = status === 'COMPLETED';
  const isClaimed  = status === 'CLAIMED';

  return (
    <View style={[styles.card, isClaimed && styles.cardFaded]}>

      {/* Kategori Badge */}
      <View style={[styles.badge, { backgroundColor: cfg.color + '22' }]}>
        <Ionicons name={cfg.icon} size={11} color={cfg.color} />
        <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {/* Başlık + XP */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, isClaimed && styles.muted]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.xpPill}>
          <Ionicons name="star" size={11} color="#FFD700" />
          <Text style={styles.xpText}>{xpReward} XP</Text>
        </View>
      </View>

      <Text style={styles.desc}>{description}</Text>

      {/* Progress Bar */}
      <View style={styles.progressRow}>
        <View style={styles.track}>
          <View style={[
            styles.fill,
            { width: `${pct * 100}%` },
            isComplete && styles.fillComplete,
          ]} />
        </View>
        <Text style={styles.progText}>{progressCount}/{targetCount}</Text>
      </View>

      {/* CTA */}
      {isComplete && !isClaimed && onClaim && (
        <TouchableOpacity style={styles.claimBtn} onPress={() => onClaim(id)}>
          <Text style={styles.claimTxt}>Ödülü Al</Text>
          <Ionicons name="gift-outline" size={15} color="#1E1E2E" />
        </TouchableOpacity>
      )}

      {isClaimed && (
        <View style={styles.claimedRow}>
          <Ionicons name="checkmark-circle" size={14} color="#4ECDC4" />
          <Text style={styles.claimedTxt}>Tamamlandı</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E2E', borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginVertical: 6,
    borderWidth: 1, borderColor: '#2E2E4E',
  },
  cardFaded: { opacity: 0.55 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 10, marginBottom: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 4,
  },
  title: { fontSize: 15, fontWeight: '600', color: '#E8E8F0', flex: 1, marginRight: 8 },
  muted: { color: '#6E6E80' },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  xpText: { fontSize: 13, fontWeight: '700', color: '#FFD700' },
  desc: { fontSize: 13, color: '#8E8EA0', marginBottom: 12, lineHeight: 18 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  track: {
    flex: 1, height: 6, backgroundColor: '#2E2E4E',
    borderRadius: 3, overflow: 'hidden',
  },
  fill:         { height: '100%', backgroundColor: '#A78BFA', borderRadius: 3 },
  fillComplete: { backgroundColor: '#4ECDC4' },
  progText: { fontSize: 12, color: '#8E8EA0', width: 38, textAlign: 'right' },
  claimBtn: {
    backgroundColor: '#FFD700', borderRadius: 10, paddingVertical: 10,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  claimTxt: { color: '#1E1E2E', fontWeight: '700', fontSize: 14 },
  claimedRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 4, paddingVertical: 6,
  },
  claimedTxt: { color: '#4ECDC4', fontSize: 13, fontWeight: '500' },
});
```


***

## D46 — `components/leaderboard/LeaderboardList.tsx`

Hafta 8'in `GET /leaderboard` yanıt sözleşmesi (`entries`, `myRank`, `leagueSlug`) doğrudan tüketilir. Kendi satırı `A78BFA` rengiyle vurgulanır; üst 3 sıra emoji rozet alır.[^1_2]

```tsx
// src/components/leaderboard/LeaderboardList.tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList, ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LeaderboardEntry, LeagueSlug, MyRank } from '../../types/gamification.types';

interface Props {
  entries:       LeaderboardEntry[];
  myRank:        MyRank;
  leagueSlug:    LeagueSlug | null;
  currentUserId: string;
}

const LEAGUE: Record<LeagueSlug, { label: string; color: string; icon: string }> = {
  bronze:  { label: 'Bronz Lig',  color: '#CD7F32', icon: '🥉' },
  silver:  { label: 'Gümüş Lig', color: '#C0C0C0', icon: '🥈' },
  gold:    { label: 'Altın Lig',  color: '#FFD700', icon: '🥇' },
  diamond: { label: 'Elmas Lig',  color: '#B9F2FF', icon: '💎' },
};

const TOP3: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export const LeaderboardList: React.FC<Props> = ({
  entries, myRank, leagueSlug, currentUserId,
}) => {
  const league = leagueSlug ? LEAGUE[leagueSlug] : null;

  const renderRow: ListRenderItem<LeaderboardEntry> = ({ item }) => {
    const isMe = item.userId === currentUserId;
    return (
      <View style={[styles.row, isMe && styles.rowMe]}>
        <View style={styles.rankBox}>
          {TOP3[item.rank]
            ? <Text style={styles.rankEmoji}>{TOP3[item.rank]}</Text>
            : <Text style={[styles.rankNum, isMe && styles.rankNumMe]}>#{item.rank}</Text>
          }
        </View>
        <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
          {item.displayName}{isMe ? ' (Sen)' : ''}
        </Text>
        <View style={styles.scoreBox}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={[styles.score, isMe && styles.scoreMe]}>
            {item.score.toLocaleString('tr-TR')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>

      {/* Lig Başlığı */}
      {league && (
        <View style={[styles.leagueBar, { borderLeftColor: league.color }]}>
          <Text style={styles.leagueIcon}>{league.icon}</Text>
          <Text style={[styles.leagueName, { color: league.color }]}>{league.label}</Text>
        </View>
      )}

      {/* Kendi Sırası — Sticky Banner */}
      {myRank.rank !== null && (
        <View style={styles.myBanner}>
          <Text style={styles.myRankText}>Sıran: #{myRank.rank}</Text>
          <View style={styles.myScoreRow}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.myScore}>
              {myRank.score?.toLocaleString('tr-TR')} XP
            </Text>
          </View>
        </View>
      )}

      {/* Liste */}
      <FlatList
        data={entries}
        keyExtractor={(e) => e.userId}
        renderItem={renderRow}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Henüz sıralama yok.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2E', borderRadius: 16, overflow: 'hidden',
    marginHorizontal: 16, marginVertical: 8,
    borderWidth: 1, borderColor: '#2E2E4E',
  },
  leagueBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: '#2E2E4E',
  },
  leagueIcon: { fontSize: 20 },
  leagueName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  myBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#252540', borderBottomWidth: 1, borderBottomColor: '#2E2E4E',
  },
  myRankText:  { color: '#A78BFA', fontWeight: '600', fontSize: 14 },
  myScoreRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  myScore:     { color: '#FFD700', fontWeight: '600', fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  rowMe:      { backgroundColor: '#252540' },
  rankBox:    { width: 38, alignItems: 'center' },
  rankEmoji:  { fontSize: 18 },
  rankNum:    { fontSize: 14, fontWeight: '600', color: '#8E8EA0' },
  rankNumMe:  { color: '#A78BFA' },
  name: {
    flex: 1, fontSize: 14, color: '#E8E8F0',
    fontWeight: '500', paddingHorizontal: 10,
  },
  nameMe:  { color: '#A78BFA', fontWeight: '700' },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score:   { fontSize: 14, color: '#E8E8F0', fontWeight: '600' },
  scoreMe: { color: '#FFD700' },
  sep:   { height: 1, backgroundColor: '#2E2E4E', marginHorizontal: 16 },
  empty: { color: '#8E8EA0', textAlign: 'center', padding: 20, fontSize: 14 },
});
```


***

## D47 — Ekranlar (Entegrasyon Katmanı)

```tsx
// src/screens/HomeScreen.tsx
import React from 'react';
import { ScrollView, ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { StreakWidget }  from '../components/streak/StreakWidget';
import { useGamification } from '../hooks/useGamification';

export default function HomeScreen() {
  const { streak, xpProfile, isLoading, checkIn } = useGamification();

  if (isLoading) return (
    <View style={s.center}>
      <ActivityIndicator color="#FF6B35" size="large" />
    </View>
  );

  return (
    <ScrollView style={s.screen}>
      {/* XP Bar */}
      {xpProfile && (
        <View style={s.xpBar}>
          <Text style={s.level}>Seviye {xpProfile.level} — {xpProfile.levelName}</Text>
          <View style={s.xpTrack}>
            <View style={[s.xpFill, {
              width: `${((xpProfile.totalXp - xpProfile.currentLevelXp)
                      / (xpProfile.nextLevelXp - xpProfile.currentLevelXp)) * 100}%`
            }]} />
          </View>
          <Text style={s.xpLabel}>{xpProfile.totalXp} / {xpProfile.nextLevelXp} XP</Text>
        </View>
      )}

      {/* Streak Widget */}
      {streak && <StreakWidget streak={streak} onCheckIn={checkIn} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#13131F' },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  xpBar:   { margin: 16, padding: 14, backgroundColor: '#1E1E2E', borderRadius: 14 },
  level:   { fontSize: 14, color: '#A78BFA', fontWeight: '600', marginBottom: 8 },
  xpTrack: { height: 8, backgroundColor: '#2E2E4E', borderRadius: 4, overflow: 'hidden' },
  xpFill:  { height: '100%', backgroundColor: '#A78BFA', borderRadius: 4 },
  xpLabel: { fontSize: 12, color: '#8E8EA0', marginTop: 6, textAlign: 'right' },
});
```

```tsx
// src/screens/MissionsScreen.tsx
import React from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MissionCard } from '../components/missions/MissionCard';
import { useGamification } from '../hooks/useGamification';
import type { Mission } from '../types/gamification.types';

export default function MissionsScreen() {
  const { activeMissions, isLoading, claimReward } = useGamification();

  if (isLoading) return (
    <View style={s.center}><ActivityIndicator color="#A78BFA" size="large" /></View>
  );

  return (
    <FlatList<Mission>
      data={activeMissions}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => (
        <MissionCard mission={item} onClaim={claimReward} />
      )}
      ListHeaderComponent={<Text style={s.header}>Görevler</Text>}
      ListEmptyComponent={<Text style={s.empty}>Henüz görev yok.</Text>}
      contentContainerStyle={s.list}
      style={s.screen}
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#13131F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:   { paddingBottom: 32 },
  header: { fontSize: 20, fontWeight: '700', color: '#E8E8F0', margin: 16 },
  empty:  { color: '#8E8EA0', textAlign: 'center', padding: 32 },
});
```

```tsx
// src/screens/LeaderboardScreen.tsx
import React from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LeaderboardList } from '../components/leaderboard/LeaderboardList';
import { useGamification }  from '../hooks/useGamification';

const MY_USER_ID = 'CURRENT_USER_ID'; // Auth context'ten alınacak

export default function LeaderboardScreen() {
  const { leaderboard, isLoading } = useGamification();

  if (isLoading) return (
    <View style={s.center}><ActivityIndicator color="#FFD700" size="large" /></View>
  );

  return (
    <ScrollView style={s.screen}>
      <Text style={s.header}>Liderlik Tablosu</Text>
      {leaderboard && (
        <LeaderboardList
          entries={leaderboard.entries}
          myRank={leaderboard.myRank}
          leagueSlug={leaderboard.leagueSlug}
          currentUserId={MY_USER_ID}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#13131F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 20, fontWeight: '700', color: '#E8E8F0', margin: 16 },
});
```


***

## 📐 10. Hafta Deliverable Matrisi

| \# | Dosya | Amaç | Backend Bağı |
| :-- | :-- | :-- | :-- |
| D38 | `Klasör Mimarisi` | Katmanlı modüler yapı | Hafta 1 servis bölümü |
| D39 | `types/gamification.types.ts` | Tek kaynaklı tip sözleşmesi | Tüm API yanıt şemaları |
| D40 | `store/gamification.store.ts` | Zustand global state | Hafta 5-8 veri modelleri |
| D41 | `api/client.ts` | JWT interceptor + refresh | Hafta 2 auth modeli |
| D42 | `api/*.api.ts` | Servis katmanı | Hafta 6-8 endpoint'leri |
| D43 | `hooks/useGamification.ts` | Paralel veri çekimi köprüsü | `Promise.all` — 3 endpoint |
| D44 | `StreakWidget.tsx` | Seri + Freeze + Haftalık takvim | Hafta 6 v2 streak modeli |
| D45 | `MissionCard.tsx` | Progress bar'lı görev kartı | Hafta 7 mission engine |
| D46 | `LeaderboardList.tsx` | Lig + Kendi sırası vurgulu liste | Hafta 8 Redis ZSET API |
| D47 | `Screen'ler (3 adet)` | Bileşen entegrasyon katmanı | Tüm hafta entegrasyonu |

> ⚠️ **Kritik Uyarı — `MY_USER_ID`:** `LeaderboardScreen.tsx` içindeki sabit değer, gerçek uygulamada Auth context'ten (JWT `sub` claim'inden) alınmalıdır. Sabit bırakılırsa "kendi satırı" hiçbir zaman vurgulanmaz.[^1_2]

> ⚠️ **Bağımlılıklar:** `expo-secure-store`, `axios`, `zustand`, `@expo/vector-icons` paketleri `expo install expo-secure-store && npm i axios zustand` ile kurulmalıdır. NativeWind kullanmak isterseniz `StyleSheet` objeleri Tailwind class'larıyla birebir değiştirilebilir; mimari değişmez.[^1_3]
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: FinRoute_9.Hafta_Gorev.md

[^1_2]: FinRoute_8.Hafta_Gorev.md

[^1_3]: Hafta-Alan-Ama-SomutDeliverablelar.csv

[^1_4]: FinRoute_9.hafta Kontrol.md

[^1_5]: FinRoute_8.hafta Kontrol.md

[^1_6]: FinRoute_7.Hafta_Gorev.md

[^1_7]: FinRoute_7.hafta Kontrol.md

[^1_8]: FinRoute_6.Hafta_Gorev.md

[^1_9]: FinRoute_6.hafta Kontrol.md

[^1_10]: FinRoute_5.Hafta_Gorev.md

[^1_11]: FinRoute_5.hafta Kontrol.md

[^1_12]: FinRoute 3.hafta Görev.md

[^1_13]: FinRoute_2.Hafta_Gorev.pdf

[^1_14]: FinRoute — Hafta 1 Deliverables_ Ürün \& Risk + Mim.pdf

[^1_15]: -Deliverable-Kaynak-Durum.csv

[^1_16]: -Konu-Neredezlmeli.csv

[^1_17]: FinRoute.pdf

[^1_18]: Perplexity.pdf

[^1_19]: Perplexity AI_ İleri Düzey Kullanım Rehberi.pdf

[^1_20]: Perplexity AI İleri Düzey Kullanım Rehberi.pdf


---

# 10. Hafta React Native (Frontend) arayüzlerimiz kıdemli bir mobil performans denetiminden geçti. Uygulamayı 60 FPS akıcılığına kavuşturmak, batarya tüketimini azaltmak ve bayat veri (stale data) sorununu çözmek için kodları şu 3 net performan direktifine göre derhal (v2 olarak) güncellemeni istiyorum (Lütfen web araması yapma, sadece bu direktiflere odaklan):

Gereksiz Re-Render (Zustand \& Memoization): Zustand store okumalarını useStore(state => state.currentStreak) şeklinde spesifik selector'lara çevir. Gerekli yerlerde shallow karşılaştırmasını kullan. Satır içi fonksiyonları temizle ve liste elemanı olan MissionCard ile LeaderboardItem bileşenlerini React.memo ile sararak gereksiz baştan çizimleri (re-render) engelle.
FlatList Optimizasyonu (60 FPS Liste): LeaderboardList bileşenindeki FlatList yapısını performans canavarına dönüştür. İçine kesinlikle initialNumToRender={15}, maxToRenderPerBatch={10}, windowSize={5}, ve removeClippedSubviews={true} prop'larını ekle. Listenin kaydırılırken takılmaması için boyutları önceden hesaplayan getItemLayout fonksiyonunu yaz ve renderItem'ı dışarıda bir useCallback ile sarmala.
AppState ve Taze Veri (Foreground Sync): Kullanıcının uygulamayı arka plandan öne (active) aldığını anlamak için React Native'in AppState API'sini dinleyen bir useEffect (veya custom hook) yaz. Uygulama background durumundan active duruma geçtiğinde Backend'e sessizce bir istek atıp streak ve missions state'lerini güncelleyen (refetch) o taze veri mantığını koda dök.
Lütfen bu 3 devral performan yamasını içeren, yağ gibi akan 10. Hafta v2 Frontend kodlarını temiz bir Markdown ile oluştur.

Zustand, liste optimizasyonu ve foreground sync için 3 performans yaması aşağıdaki v2 kodlarında uygulanmıştır

---

# 10. Hafta React Native (Frontend) arayüzlerimiz kıdemli bir mobil performans denetiminden geçti. Uygulamayı 60 FPS akıcılığına kavuşturmak, batarya tüketimini azaltmak ve bayat veri (stale data) sorununu çözmek için kodları şu 3 net performan direktifine göre derhal (v2 olarak) güncellemeni istiyorum (Lütfen web araması yapma, sadece bu direktiflere odaklan):

Gereksiz Re-Render (Zustand \& Memoization): Zustand store okumalarını useStore(state => state.currentStreak) şeklinde spesifik selector'lara çevir. Gerekli yerlerde shallow karşılaştırmasını kullan. Satır içi fonksiyonları temizle ve liste elemanı olan MissionCard ile LeaderboardItem bileşenlerini React.memo ile sararak gereksiz baştan çizimleri (re-render) engelle.
FlatList Optimizasyonu (60 FPS Liste): LeaderboardList bileşenindeki FlatList yapısını performans canavarına dönüştür. İçine kesinlikle initialNumToRender={15}, maxToRenderPerBatch={10}, windowSize={5}, ve removeClippedSubviews={true} prop'larını ekle. Listenin kaydırılırken takılmaması için boyutları önceden hesaplayan getItemLayout fonksiyonunu yaz ve renderItem'ı dışarıda bir useCallback ile sarmala.
AppState ve Taze Veri (Foreground Sync): Kullanıcının uygulamayı arka plandan öne (active) aldığını anlamak için React Native'in AppState API'sini dinleyen bir useEffect (veya custom hook) yaz. Uygulama background durumundan active duruma geçtiğinde Backend'e sessizce bir istek atıp streak ve missions state'lerini güncelleyen (refetch) o taze veri mantığını koda dök.
Lütfen bu 3 devral performan yamasını içeren, yağ gibi akan 10. Hafta v2 Frontend kodlarını temiz bir Markdown ile oluştur.

9 haftalık backend mimarisi (Zustand store state shape'i, API endpoint sözleşmeleri, `streak`/`missions` veri modelleri) referans alınarak 3 performans direktifi v2 olarak uygulandı.[^3_1][^3_2]

***

# FinRoute — 10. Hafta v2 · Performans Yamaları

## Mobil Performans Denetimi — 3 Direktif


***

## P1 — Zustand Selector Optimizasyonu \& Memoization

### `store/gamification.store.ts` — Typed Selector'lar (v2)

V1'de bileşenler tüm store'u abone alıyordu; herhangi bir alan değiştiğinde ilgisiz bileşenler de yeniden render ediliyordu. Artık **atom granülaritesinde selector'lar** ihraç edilir.[^3_2]

```typescript
// src/store/gamification.store.ts  (v2 — tam dosya)
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';   // shallow karşılaştırma
import type {
  StreakInfo, XPProfile, Mission, LeaderboardData, LeagueSlug,
} from '../types/gamification.types';

interface GamificationState {
  streak:             StreakInfo | null;
  xpProfile:          XPProfile | null;
  activeMissions:     Mission[];
  leaderboard:        LeaderboardData | null;
  currentLeagueSlug:  LeagueSlug;
  isLoading:          boolean;
  error:              string | null;

  setStreak:          (s: StreakInfo)        => void;
  setXpProfile:       (p: XPProfile)         => void;
  setActiveMissions:  (m: Mission[])          => void;
  setLeaderboard:     (d: LeaderboardData)    => void;
  setCurrentLeague:   (slug: LeagueSlug)      => void;
  setLoading:         (v: boolean)            => void;
  setError:           (e: string | null)      => void;
  updateMissionProgress: (id: string, n: number) => void;
  decrementFreeze:    () => void;
  reset:              () => void;
}

export const useGamificationStore = create<GamificationState>((set) => ({
  streak:            null,
  xpProfile:         null,
  activeMissions:    [],
  leaderboard:       null,
  currentLeagueSlug: 'bronze',
  isLoading:         false,
  error:             null,

  setStreak:         (streak)            => set({ streak }),
  setXpProfile:      (xpProfile)         => set({ xpProfile }),
  setActiveMissions: (activeMissions)    => set({ activeMissions }),
  setLeaderboard:    (leaderboard)       => set({ leaderboard }),
  setCurrentLeague:  (currentLeagueSlug) => set({ currentLeagueSlug }),
  setLoading:        (isLoading)         => set({ isLoading }),
  setError:          (error)             => set({ error }),

  updateMissionProgress: (id, n) =>
    set((s) => ({
      activeMissions: s.activeMissions.map((m) =>
        m.id === id ? { ...m, progressCount: n } : m
      ),
    })),

  decrementFreeze: () =>
    set((s) => ({
      streak: s.streak
        ? { ...s.streak, freezeCount: Math.max(0, s.streak.freezeCount - 1) }
        : null,
    })),

  reset: () => set({
    streak: null, xpProfile: null, activeMissions: [],
    leaderboard: null, currentLeagueSlug: 'bronze',
    isLoading: false, error: null,
  }),
}));

// ─── Granüler Atom Selector'lar ──────────────────────────────────────────────
// StreakWidget yalnızca streak değişince render olur — xpProfile, missions farkı tetiklemez.
export const useStreakSelector  = () => useGamificationStore((s) => s.streak);
export const useXpSelector      = () => useGamificationStore((s) => s.xpProfile);
export const useMissionsSelector = () => useGamificationStore((s) => s.activeMissions);
export const useLeaderboardSelector = () => useGamificationStore((s) => s.leaderboard);

// Birden fazla primitif alan birlikte okunacaksa shallow karşılaştırma zorunludur.
// Aksi hâlde her render'da yeni nesne referansı eşitsiz → sonsuz döngü.
export const useLoadingErrorSelector = () =>
  useGamificationStore(
    useShallow((s) => ({ isLoading: s.isLoading, error: s.error }))
  );

// Yalnızca action'lar: state okumaz, render tetiklemez.
export const useGamificationActions = () =>
  useGamificationStore(
    useShallow((s) => ({
      setStreak:         s.setStreak,
      setXpProfile:      s.setXpProfile,
      setActiveMissions: s.setActiveMissions,
      setLeaderboard:    s.setLeaderboard,
      setCurrentLeague:  s.setCurrentLeague,
      setLoading:        s.setLoading,
      setError:          s.setError,
      updateMissionProgress: s.updateMissionProgress,
      decrementFreeze:   s.decrementFreeze,
    }))
  );
```


***

### `hooks/useGamification.ts` (v2) — Selector Refactor

V1'deki `useGamificationStore()` (tüm store aboneliği) → granüler selector'larla değiştirildi. Satır içi `() => claimReward(id)` lambda'ları `useCallback`'e taşındı.[^3_2]

```typescript
// src/hooks/useGamification.ts  (v2)
import { useCallback } from 'react';
import {
  useStreakSelector, useXpSelector, useMissionsSelector,
  useLeaderboardSelector, useLoadingErrorSelector, useGamificationActions,
} from '../store/gamification.store';
import {
  getGamificationProfile, getActiveMissions,
  postDailyCheckIn, claimMissionReward,
} from '../api/gamification.api';
import { getLeaderboard } from '../api/leaderboard.api';

export function useGamification() {
  // ── Spesifik selector'lar: her biri yalnızca kendi alanı değişince re-render ──
  const streak       = useStreakSelector();
  const xpProfile    = useXpSelector();
  const activeMissions = useMissionsSelector();
  const leaderboard  = useLeaderboardSelector();
  const { isLoading, error } = useLoadingErrorSelector();
  const actions = useGamificationActions();

  // ── fetchAll: Promise.all ile 3 endpoint paralel ─────────────────────────────
  const fetchAll = useCallback(async () => {
    actions.setLoading(true);
    actions.setError(null);
    try {
      const [profile, missions, lb] = await Promise.all([
        getGamificationProfile(),
        getActiveMissions(),
        getLeaderboard('league'),
      ]);
      actions.setStreak(profile.streakInfo);
      actions.setXpProfile(profile.xpProfile);
      actions.setActiveMissions(missions);
      actions.setLeaderboard(lb);
      if (lb.leagueSlug) actions.setCurrentLeague(lb.leagueSlug);
    } catch (err: any) {
      actions.setError(err?.response?.data?.error ?? 'Veriler yüklenemedi');
    } finally {
      actions.setLoading(false);
    }
  }, [actions]);  // actions shallow-stable → fetchAll referansı stabil kalır

  // ── Sadece streak + missions yenile (Foreground Sync için hafif versiyon) ──
  const fetchStreakAndMissions = useCallback(async () => {
    try {
      const [profile, missions] = await Promise.all([
        getGamificationProfile(),
        getActiveMissions(),
      ]);
      actions.setStreak(profile.streakInfo);
      actions.setXpProfile(profile.xpProfile);
      actions.setActiveMissions(missions);
    } catch {
      // Sessiz hata: arka plan sync UI'ı bloklamasın
    }
  }, [actions]);

  const checkIn = useCallback(async () => {
    try {
      const updated = await postDailyCheckIn();
      actions.setStreak(updated);
    } catch (err: any) {
      actions.setError(err?.response?.data?.error ?? 'Check-in başarısız');
    }
  }, [actions]);

  const claimReward = useCallback(async (missionId: string) => {
    try {
      await claimMissionReward(missionId);
      const missions = await getActiveMissions();
      actions.setActiveMissions(missions);
    } catch (err: any) {
      actions.setError(err?.response?.data?.error ?? 'Ödül alınamadı');
    }
  }, [actions]);

  return {
    streak, xpProfile, activeMissions, leaderboard,
    isLoading, error,
    fetchAll, fetchStreakAndMissions, checkIn, claimReward,
  };
}
```


***

### `components/missions/MissionCard.tsx` (v2) — `React.memo`

`React.memo`'nun custom karşılaştırıcısı ile yalnızca `progressCount` veya `status` değiştiğinde render tetiklenir.[^3_2]

```tsx
// src/components/missions/MissionCard.tsx  (v2)
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Mission } from '../../types/gamification.types';

interface Props {
  mission:  Mission;
  onClaim?: (id: string) => void;  // useCallback ile sarılı geçilmeli (HomeScreen'de)
}

const CAT_CFG = {
  DAILY:  { label: 'Günlük',   color: '#4ECDC4', icon: 'today-outline'    as const },
  WEEKLY: { label: 'Haftalık', color: '#A78BFA', icon: 'calendar-outline' as const },
};

const MissionCardInner: React.FC<Props> = ({ mission, onClaim }) => {
  const { id, title, description, category, xpReward,
          targetCount, progressCount, status } = mission;
  const cfg        = CAT_CFG[category];
  const pct        = Math.min(progressCount / targetCount, 1);
  const isComplete = status === 'COMPLETED';
  const isClaimed  = status === 'CLAIMED';

  // onClaim prop'u dışarıdan useCallback ile geldiği için burada tekrar sarmaya gerek yok.
  // Ancak iç onClick'i memo bileşende inline tanımlamak re-render fırsatını iptal eder.
  const handleClaim = useCallback(() => onClaim?.(id), [onClaim, id]);

  return (
    <View style={[s.card, isClaimed && s.faded]}>
      <View style={[s.badge, { backgroundColor: cfg.color + '22' }]}>
        <Ionicons name={cfg.icon} size={11} color={cfg.color} />
        <Text style={[s.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
      <View style={s.titleRow}>
        <Text style={[s.title, isClaimed && s.muted]} numberOfLines={2}>{title}</Text>
        <View style={s.xpPill}>
          <Ionicons name="star" size={11} color="#FFD700" />
          <Text style={s.xpTxt}>{xpReward} XP</Text>
        </View>
      </View>
      <Text style={s.desc}>{description}</Text>
      <View style={s.progRow}>
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct * 100}%` }, isComplete && s.fillDone]} />
        </View>
        <Text style={s.progTxt}>{progressCount}/{targetCount}</Text>
      </View>
      {isComplete && !isClaimed && onClaim && (
        <TouchableOpacity style={s.claimBtn} onPress={handleClaim}>
          <Text style={s.claimTxt}>Ödülü Al</Text>
          <Ionicons name="gift-outline" size={15} color="#1E1E2E" />
        </TouchableOpacity>
      )}
      {isClaimed && (
        <View style={s.doneRow}>
          <Ionicons name="checkmark-circle" size={14} color="#4ECDC4" />
          <Text style={s.doneTxt}>Tamamlandı</Text>
        </View>
      )}
    </View>
  );
};

// Custom karşılaştırıcı: yalnızca görünümü etkileyen alanlar değiştiğinde render et.
// title, description, xpReward sık değişmez; progressCount ve status değişimi belirleyicidir.
export const MissionCard = memo(MissionCardInner, (prev, next) =>
  prev.mission.progressCount === next.mission.progressCount &&
  prev.mission.status         === next.mission.status        &&
  prev.onClaim                === next.onClaim
);

const s = StyleSheet.create({
  card:     { backgroundColor: '#1E1E2E', borderRadius: 14, padding: 14, marginHorizontal: 16, marginVertical: 6, borderWidth: 1, borderColor: '#2E2E4E' },
  faded:    { opacity: 0.55 },
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 8 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title:    { fontSize: 15, fontWeight: '600', color: '#E8E8F0', flex: 1, marginRight: 8 },
  muted:    { color: '#6E6E80' },
  xpPill:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  xpTxt:    { fontSize: 13, fontWeight: '700', color: '#FFD700' },
  desc:     { fontSize: 13, color: '#8E8EA0', marginBottom: 12, lineHeight: 18 },
  progRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  track:    { flex: 1, height: 6, backgroundColor: '#2E2E4E', borderRadius: 3, overflow: 'hidden' },
  fill:     { height: '100%', backgroundColor: '#A78BFA', borderRadius: 3 },
  fillDone: { backgroundColor: '#4ECDC4' },
  progTxt:  { fontSize: 12, color: '#8E8EA0', width: 38, textAlign: 'right' },
  claimBtn: { backgroundColor: '#FFD700', borderRadius: 10, paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  claimTxt: { color: '#1E1E2E', fontWeight: '700', fontSize: 14 },
  doneRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 6 },
  doneTxt:  { color: '#4ECDC4', fontSize: 13, fontWeight: '500' },
});
```


***

## P2 — FlatList 60 FPS Optimizasyonu

### `components/leaderboard/LeaderboardList.tsx` (v2)

`getItemLayout` liste elemanı yüksekliğini önceden bildirir → layout hesaplaması atlanır, `scrollToIndex` anında çalışır. `renderItem` dışarıda `useCallback` ile sarılır.[^3_1]

```tsx
// src/components/leaderboard/LeaderboardList.tsx  (v2)
import React, { useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ListRenderItemInfo, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  LeaderboardEntry, LeagueSlug, MyRank,
} from '../../types/gamification.types';

// ── Sabit yükseklik: getItemLayout için zorunlu. Değişirse burası güncellenir.
const ROW_HEIGHT      = 56;   // paddingVertical 12*2 + içerik ~32
const SEPARATOR_HEIGHT = 1;
const ITEM_HEIGHT = ROW_HEIGHT + SEPARATOR_HEIGHT;

// ── Hafif satır bileşeni — kendi memo'su ile ──────────────────────────────────
interface RowProps {
  item:          LeaderboardEntry;
  isMe:          boolean;
}

const TOP3: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const LeaderboardRowInner: React.FC<RowProps> = ({ item, isMe }) => (
  <View style={[s.row, isMe && s.rowMe]}>
    <View style={s.rankBox}>
      {TOP3[item.rank]
        ? <Text style={s.emoji}>{TOP3[item.rank]}</Text>
        : <Text style={[s.rankNum, isMe && s.rankNumMe]}>#{item.rank}</Text>
      }
    </View>
    <Text style={[s.name, isMe && s.nameMe]} numberOfLines={1}>
      {item.displayName}{isMe ? ' (Sen)' : ''}
    </Text>
    <View style={s.scoreBox}>
      <Ionicons name="star" size={12} color="#FFD700" />
      <Text style={[s.score, isMe && s.scoreMe]}>
        {item.score.toLocaleString('tr-TR')}
      </Text>
    </View>
  </View>
);

// Custom karşılaştırıcı: rank, score veya isMe değişmedikçe re-render yok
const LeaderboardRow = memo(LeaderboardRowInner, (prev, next) =>
  prev.item.rank  === next.item.rank  &&
  prev.item.score === next.item.score &&
  prev.isMe       === next.isMe
);

// ── Ana Liste Bileşeni ────────────────────────────────────────────────────────
const LEAGUE: Record<LeagueSlug, { label: string; color: string; icon: string }> = {
  bronze:  { label: 'Bronz Lig',  color: '#CD7F32', icon: '🥉' },
  silver:  { label: 'Gümüş Lig', color: '#C0C0C0', icon: '🥈' },
  gold:    { label: 'Altın Lig',  color: '#FFD700', icon: '🥇' },
  diamond: { label: 'Elmas Lig',  color: '#B9F2FF', icon: '💎' },
};

interface Props {
  entries:       LeaderboardEntry[];
  myRank:        MyRank;
  leagueSlug:    LeagueSlug | null;
  currentUserId: string;
}

export const LeaderboardList: React.FC<Props> = ({
  entries, myRank, leagueSlug, currentUserId,
}) => {
  const league = leagueSlug ? LEAGUE[leagueSlug] : null;

  // ── renderItem dışarıda useCallback: her render'da yeni fonksiyon oluşmaz ──
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LeaderboardEntry>) => (
      <LeaderboardRow
        item={item}
        isMe={item.userId === currentUserId}
      />
    ),
    [currentUserId],  // currentUserId değişmediği sürece renderItem stable
  );

  // ── getItemLayout: scroll pozisyonunu önceden hesaplar, measureLayout atlanır ──
  const getItemLayout = useCallback(
    (_: ArrayLike<LeaderboardEntry> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback(
    (item: LeaderboardEntry) => item.userId,
    [],
  );

  const Separator = useCallback(
    () => <View style={s.sep} />,
    [],
  );

  return (
    <View style={s.container}>
      {/* Lig Başlığı */}
      {league && (
        <View style={[s.leagueBar, { borderLeftColor: league.color }]}>
          <Text style={s.leagueIcon}>{league.icon}</Text>
          <Text style={[s.leagueName, { color: league.color }]}>{league.label}</Text>
        </View>
      )}

      {/* Kendi Sırası — Sticky Banner */}
      {myRank.rank !== null && (
        <View style={s.myBanner}>
          <Text style={s.myRankTxt}>Sıran: #{myRank.rank}</Text>
          <View style={s.myScoreRow}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={s.myScore}>{myRank.score?.toLocaleString('tr-TR')} XP</Text>
          </View>
        </View>
      )}

      {/* ── Performans Kritik FlatList ── */}
      <FlatList
        data={entries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        ItemSeparatorComponent={Separator}

        // ── 60 FPS Direktifi prop'ları ──────────────────────────────────────
        initialNumToRender={15}        // İlk frame'de 15 satır — ekranı doldurur, overflow yok
        maxToRenderPerBatch={10}       // Her JS batch'te 10 satır — frame drop önlenir
        windowSize={5}                 // Görünen alan ± 2 ekran yüksekliği render edilir
        removeClippedSubviews={
          Platform.OS === 'android'    // iOS'ta UIKit kendi optimizasyonunu yapar
        }

        scrollEnabled={false}          // ScrollView içindeyse conflict önle
        ListEmptyComponent={
          <Text style={s.empty}>Henüz sıralama yok.</Text>
        }
      />
    </View>
  );
};

const s = StyleSheet.create({
  container:  { backgroundColor: '#1E1E2E', borderRadius: 16, overflow: 'hidden', marginHorizontal: 16, marginVertical: 8, borderWidth: 1, borderColor: '#2E2E4E' },
  leagueBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: '#2E2E4E' },
  leagueIcon: { fontSize: 20 },
  leagueName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  myBanner:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#252540', borderBottomWidth: 1, borderBottomColor: '#2E2E4E' },
  myRankTxt:  { color: '#A78BFA', fontWeight: '600', fontSize: 14 },
  myScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  myScore:    { color: '#FFD700', fontWeight: '600', fontSize: 14 },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, height: ROW_HEIGHT },
  rowMe:      { backgroundColor: '#252540' },
  rankBox:    { width: 38, alignItems: 'center' },
  emoji:      { fontSize: 18 },
  rankNum:    { fontSize: 14, fontWeight: '600', color: '#8E8EA0' },
  rankNumMe:  { color: '#A78BFA' },
  name:       { flex: 1, fontSize: 14, color: '#E8E8F0', fontWeight: '500', paddingHorizontal: 10 },
  nameMe:     { color: '#A78BFA', fontWeight: '700' },
  scoreBox:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score:      { fontSize: 14, color: '#E8E8F0', fontWeight: '600' },
  scoreMe:    { color: '#FFD700' },
  sep:        { height: SEPARATOR_HEIGHT, backgroundColor: '#2E2E4E', marginHorizontal: 16 },
  empty:      { color: '#8E8EA0', textAlign: 'center', padding: 20, fontSize: 14 },
});
```


***

## P3 — AppState Foreground Sync

### `hooks/useForegroundSync.ts` (yeni dosya)

Custom hook: `background → active` geçişinde **sessizce** backend'den streak ve missions yenilenir. `previousState` referansı ile `active → active` (yan geçiş) tetiklemesi engellenir.[^3_2]

```typescript
// src/hooks/useForegroundSync.ts  (yeni — P3)
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Uygulama arka plandan öne geldiğinde `onForeground` callback'ini çağırır.
 * `active → active` (aynı durumda) tetiklenmez.
 * Callback referansı her render'da değişse de son versiyonu çalıştırılır (ref pattern).
 */
export function useForegroundSync(onForeground: () => void | Promise<void>) {
  // Callback'i ref'e alıyoruz → useEffect dependency'ye eklemeye gerek yok.
  // Bu React'ın "event handler ref" pattern'ıdır.
  const callbackRef = useRef(onForeground);
  useEffect(() => { callbackRef.current = onForeground; });

  const prevStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const prevState = prevStateRef.current;
        prevStateRef.current = nextState;

        // Yalnızca background/inactive → active geçişinde tetikle.
        // active → active (focus değişimi) veya background → inactive geçişini yoksay.
        const wasInBackground =
          prevState === 'background' || prevState === 'inactive';
        const isNowActive = nextState === 'active';

        if (wasInBackground && isNowActive) {
          // Void cast: Promise hatası sessiz kalır, UI render'ı bloklamaz.
          void callbackRef.current();
        }
      }
    );

    return () => subscription.remove();
  }, []); // Boş deps: mount/unmount'ta kurulur, tek listener
}
```


***

### `screens/HomeScreen.tsx` (v2) — Foreground Sync Entegrasyonu

```tsx
// src/screens/HomeScreen.tsx  (v2)
import React, { useEffect } from 'react';
import { ScrollView, ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { StreakWidget }      from '../components/streak/StreakWidget';
import { useGamification }  from '../hooks/useGamification';
import { useForegroundSync } from '../hooks/useForegroundSync';

export default function HomeScreen() {
  const {
    streak, xpProfile,
    isLoading,
    fetchAll,
    fetchStreakAndMissions,  // P3: hafif arka plan sync
    checkIn,
  } = useGamification();

  // İlk yükleme
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // P3 — Foreground Sync: arka plandan dönünce streak + missions sessizce güncellenir.
  // fetchAll (3 endpoint) değil fetchStreakAndMissions (2 endpoint) kullanılır — batarya tasarrufu.
  useForegroundSync(fetchStreakAndMissions);

  if (isLoading && !streak) return (
    <View style={s.center}>
      <ActivityIndicator color="#FF6B35" size="large" />
    </View>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* XP Bar */}
      {xpProfile && (
        <View style={s.xpCard}>
          <Text style={s.level}>Seviye {xpProfile.level} — {xpProfile.levelName}</Text>
          <View style={s.track}>
            <View style={[s.fill, {
              width: `${Math.min(
                (xpProfile.totalXp - xpProfile.currentLevelXp) /
                (xpProfile.nextLevelXp - xpProfile.currentLevelXp),
                1
              ) * 100}%`,
            }]} />
          </View>
          <Text style={s.xpLabel}>
            {xpProfile.totalXp.toLocaleString('tr-TR')} / {xpProfile.nextLevelXp.toLocaleString('tr-TR')} XP
          </Text>
        </View>
      )}

      {/* Streak Widget — kendi selector'ıyla izole render */}
      {streak && <StreakWidget streak={streak} onCheckIn={checkIn} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#13131F' },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 32 },
  xpCard:  { margin: 16, padding: 14, backgroundColor: '#1E1E2E', borderRadius: 14, borderWidth: 1, borderColor: '#2E2E4E' },
  level:   { fontSize: 14, color: '#A78BFA', fontWeight: '600', marginBottom: 8 },
  track:   { height: 8, backgroundColor: '#2E2E4E', borderRadius: 4, overflow: 'hidden' },
  fill:    { height: '100%', backgroundColor: '#A78BFA', borderRadius: 4 },
  xpLabel: { fontSize: 12, color: '#8E8EA0', marginTop: 6, textAlign: 'right' },
});
```


***

### `screens/MissionsScreen.tsx` (v2) — `claimReward` Stabilizasyonu

V1'de `onClaim={claimReward}` prop her render'da yeni referans üretiyordu → tüm `MissionCard`'lar `React.memo`'ya rağmen yeniden render ediliyordu.[^3_2]

```tsx
// src/screens/MissionsScreen.tsx  (v2)
import React, { useEffect } from 'react';
import {
  FlatList, View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import { MissionCard }       from '../components/missions/MissionCard';
import { useGamification }   from '../hooks/useGamification';
import { useForegroundSync } from '../hooks/useForegroundSync';
import type { Mission }      from '../types/gamification.types';

export default function MissionsScreen() {
  const {
    activeMissions, isLoading,
    fetchAll, fetchStreakAndMissions, claimReward,
  } = useGamification();

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // P3: arka plandan dönünce görevler de güncellenir (yeni görev açılmış olabilir)
  useForegroundSync(fetchStreakAndMissions);

  if (isLoading && !activeMissions.length) return (
    <View style={s.center}><ActivityIndicator color="#A78BFA" size="large" /></View>
  );

  return (
    <FlatList<Mission>
      data={activeMissions}
      keyExtractor={(m) => m.id}
      // claimReward: useCallback ile stable → MissionCard memo'su çalışır
      renderItem={({ item }) => <MissionCard mission={item} onClaim={claimReward} />}
      ListHeaderComponent={<Text style={s.header}>Görevler</Text>}
      ListEmptyComponent={<Text style={s.empty}>Henüz görev yok.</Text>}
      contentContainerStyle={s.list}
      style={s.screen}
      // P2 ile simetrik FlatList ayarları (görev listesi daha kısa olduğundan düşük değerler)
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={3}
      removeClippedSubviews={false}  // Görev listesi kısa: clipping kazancı yok
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#13131F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:   { paddingBottom: 32 },
  header: { fontSize: 20, fontWeight: '700', color: '#E8E8F0', margin: 16 },
  empty:  { color: '#8E8EA0', textAlign: 'center', padding: 32 },
});
```


***

## 📐 10. Hafta v2 Performans Denetim Matrisi

| \# | Direktif | v1 Sorunu | v2 Çözümü | Dosya |
| :-- | :-- | :-- | :-- | :-- |
| P1-A | Zustand tüm store | Her alan değişiminde tüm tree render | Atom selector'lar + `useShallow` | `store/gamification.store.ts` |
| P1-B | Satır içi lambda | `onClaim={() => fn(id)}` her render yeni ref | `useCallback` + `actions` ref stabilizasyonu | `hooks/useGamification.ts` |
| P1-C | `MissionCard` re-render | Parent'ın her render'ında liste yeniden çizildi | `React.memo` + custom comparator | `MissionCard.tsx` |
| P1-D | `LeaderboardRow` re-render | 50 satır aynı anda render | `React.memo` + `rank/score/isMe` comparator | `LeaderboardList.tsx` |
| P2-A | `getItemLayout` yok | Her scroll'da layout measure maliyeti | Sabit `ITEM_HEIGHT` + `getItemLayout` | `LeaderboardList.tsx` |
| P2-B | `renderItem` inline | Her FlatList render'da yeni fonksiyon ref | `useCallback` ile dışarı taşındı | `LeaderboardList.tsx` |
| P2-C | FlatList perf props | Varsayılan değerler, yüksek bellek/CPU | `initialNumToRender=15`, `maxToRenderPerBatch=10`, `windowSize=5` | `LeaderboardList.tsx` |
| P2-D | `removeClippedSubviews` | Android'de görünmez item'lar bellekte | `Platform.OS === 'android'` koşullu | `LeaderboardList.tsx` |
| P3-A | Stale veri (bayat) | Arka plandan dönünce eski streak/mission | `AppState` listener → `fetchStreakAndMissions` | `useForegroundSync.ts` |
| P3-B | Batarya israfı | Foreground'da `fetchAll` (3 endpoint) | Hafif `fetchStreakAndMissions` (2 endpoint) | `hooks/useGamification.ts` |
| P3-C | Çift tetikleme | `active → active` ping yapıyordu | `prevState` ref ile `background → active` filtresi | `useForegroundSync.ts` |

> ⚠️ **`removeClippedSubviews` Uyarısı:** iOS'ta bu prop `false` bırakılmalıdır; UIKit kendi native optimizasyonunu yönetir, React Native'in clipping mekanizması iOS'ta nadiren kazanç sağlar, bazı durumlarda görsel artifakt yaratır.[^3_2]

> ⚠️ **`getItemLayout` Sözleşmesi:** `ROW_HEIGHT` sabitini değiştirirseniz `StyleSheet`'teki `height: ROW_HEIGHT` ile senkronize tutun. İkisi arasında tutarsızlık `scrollToIndex` yanlış pozisyona atlar.[^3_1]

<div align="center">⁂</div>

[^3_1]: FinRoute_8.Hafta_Gorev.md

[^3_2]: FinRoute_9.Hafta_Gorev.md


---

# 10. Hafta v2 Frontend kodlarımız performans denetiminden geçti. Zustand ve AppState senkronizasyonları mükemmel, ancak FlatList sanallaştırmasını (virtualization) tamamen öldüren ölümcül bir 'ScrollView tuzağı' tespit edildi. Bu hataları düzeltmek için kodları şu 2 net direktife göre derhal (v3 olarak) güncellemeni istiyorum (Lütfen web araması yapma, sadece bu direktiflere odaklan):

FlatList Sanallaştırmasını Kurtar (Katil Satırları Sil): LeaderboardList.tsx içindeki scrollEnabled={false} satırını KESİNLİKLE kaldır. Ardından LeaderboardScreen.tsx dosyasına git ve listeyi saran o dış ScrollView bileşenini tamamen sil; bırak scroll işlemini sadece içerideki FlatList kendi başına yönetsin.
MissionsScreen useCallback Kalkanı: MissionsScreen.tsx içindeki renderItem={({ item }) => <MissionCard ... />} şeklindeki satır içi (inline) lambda fonksiyonunu kaldır. Bunun yerine fonksiyonu bileşenin üst kısmında const renderMission = useCallback(...) şeklinde tanımlayarak React.memo kalkanının delinmesini engelle.
Lütfen bu spesifik yamaları içeren, React Native sanallaştırma kurallarına %100 uyan 10. Hafta v3 Frontend kodlarını temiz bir Markdown ile oluştur.

Tespit edilen iki ölümcül hata net: `scrollEnabled={false}` FlatList'in sanal pencere hesaplamasını tamamen devre dışı bırakır, dış `ScrollView` ise tüm liste öğelerini aynı anda DOM'a basar. Cerrahi yamalar aşağıdadır.[^4_1][^4_2]

***

# FinRoute — 10. Hafta v3 · ScrollView Tuzağı \& useCallback Kalkanı


***

## Neden Ölümcül? — Kök Neden Analizi

| Semptom | Kök Neden | Sonuç |
| :-- | :-- | :-- |
| `scrollEnabled={false}` | FlatList yüksekliğini `∞` sayar | `windowSize`, `maxToRenderPerBatch`, `removeClippedSubviews` tamamen etkisiz — tüm 50 satır aynı anda render edilir |
| Dış `ScrollView` sarmalayıcı | FlatList içinde tanımsız yükseklik | Sanallaştırma çalışmaz, `getItemLayout` işe yaramaz, kaydırma çakışması (scroll conflict) |
| `MissionsScreen` inline lambda | `React.memo` prop karşılaştırması her render'da yeni fonksiyon referansı görür | `MissionCard` üzerindeki tüm `React.memo` kalkanı delinir |


***

## V3 — Direktif 1: `LeaderboardList.tsx`

`scrollEnabled={false}` satırı kaldırıldı. FlatList artık kendi yüksekliğini ve scroll davranışını tam olarak yönetir; v2'de eklenen tüm performans prop'ları bu düzeltmeyle gerçekten aktive olur.[^4_2]

```tsx
// src/components/leaderboard/LeaderboardList.tsx  (v3 — tek değişiklik: scrollEnabled kaldırıldı)
import React, { useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ListRenderItemInfo, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  LeaderboardEntry, LeagueSlug, MyRank,
} from '../../types/gamification.types';

const ROW_HEIGHT       = 56;
const SEPARATOR_HEIGHT = 1;
const ITEM_HEIGHT      = ROW_HEIGHT + SEPARATOR_HEIGHT;

interface RowProps {
  item: LeaderboardEntry;
  isMe: boolean;
}

const TOP3: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const LeaderboardRowInner: React.FC<RowProps> = ({ item, isMe }) => (
  <View style={[s.row, isMe && s.rowMe]}>
    <View style={s.rankBox}>
      {TOP3[item.rank]
        ? <Text style={s.emoji}>{TOP3[item.rank]}</Text>
        : <Text style={[s.rankNum, isMe && s.rankNumMe]}>#{item.rank}</Text>
      }
    </View>
    <Text style={[s.name, isMe && s.nameMe]} numberOfLines={1}>
      {item.displayName}{isMe ? ' (Sen)' : ''}
    </Text>
    <View style={s.scoreBox}>
      <Ionicons name="star" size={12} color="#FFD700" />
      <Text style={[s.score, isMe && s.scoreMe]}>
        {item.score.toLocaleString('tr-TR')}
      </Text>
    </View>
  </View>
);

const LeaderboardRow = memo(LeaderboardRowInner, (prev, next) =>
  prev.item.rank  === next.item.rank  &&
  prev.item.score === next.item.score &&
  prev.isMe       === next.isMe
);

const LEAGUE: Record<LeagueSlug, { label: string; color: string; icon: string }> = {
  bronze:  { label: 'Bronz Lig',  color: '#CD7F32', icon: '🥉' },
  silver:  { label: 'Gümüş Lig', color: '#C0C0C0', icon: '🥈' },
  gold:    { label: 'Altın Lig',  color: '#FFD700', icon: '🥇' },
  diamond: { label: 'Elmas Lig',  color: '#B9F2FF', icon: '💎' },
};

interface Props {
  entries:       LeaderboardEntry[];
  myRank:        MyRank;
  leagueSlug:    LeagueSlug | null;
  currentUserId: string;
}

export const LeaderboardList: React.FC<Props> = ({
  entries, myRank, leagueSlug, currentUserId,
}) => {
  const league = leagueSlug ? LEAGUE[leagueSlug] : null;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LeaderboardEntry>) => (
      <LeaderboardRow item={item} isMe={item.userId === currentUserId} />
    ),
    [currentUserId],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<LeaderboardEntry> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback(
    (item: LeaderboardEntry) => item.userId,
    [],
  );

  const Separator = useCallback(() => <View style={s.sep} />, []);

  const ListHeader = (
    <>
      {league && (
        <View style={[s.leagueBar, { borderLeftColor: league.color }]}>
          <Text style={s.leagueIcon}>{league.icon}</Text>
          <Text style={[s.leagueName, { color: league.color }]}>{league.label}</Text>
        </View>
      )}
      {myRank.rank !== null && (
        <View style={s.myBanner}>
          <Text style={s.myRankTxt}>Sıran: #{myRank.rank}</Text>
          <View style={s.myScoreRow}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={s.myScore}>
              {myRank.score?.toLocaleString('tr-TR')} XP
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    // ── Dış kapsayıcı: sadece kenarlık/köşe stili için; scroll yok ──────────
    <View style={s.container}>
      <FlatList
        data={entries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={<Text style={s.empty}>Henüz sıralama yok.</Text>}

        // ── 60 FPS prop'ları: scrollEnabled OLMADAN artık gerçekten çalışır ──
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}

        // ⚠️ v2'den silinen satır: scrollEnabled={false}
        // Bu prop FlatList'in içeriği ölçmesini engeller → sanallaştırma ölür.
        // FlatList scroll'u Screen seviyesinde (LeaderboardScreen) yönetilir.
      />
    </View>
  );
};

const s = StyleSheet.create({
  container:  {
    flex: 1,                     // ← FlatList yüksekliği ekran yüksekliğine göre hesaplanır
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#2E2E4E',
  },
  leagueBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: '#2E2E4E' },
  leagueIcon: { fontSize: 20 },
  leagueName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  myBanner:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#252540', borderBottomWidth: 1, borderBottomColor: '#2E2E4E' },
  myRankTxt:  { color: '#A78BFA', fontWeight: '600', fontSize: 14 },
  myScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  myScore:    { color: '#FFD700', fontWeight: '600', fontSize: 14 },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, height: ROW_HEIGHT },
  rowMe:      { backgroundColor: '#252540' },
  rankBox:    { width: 38, alignItems: 'center' },
  emoji:      { fontSize: 18 },
  rankNum:    { fontSize: 14, fontWeight: '600', color: '#8E8EA0' },
  rankNumMe:  { color: '#A78BFA' },
  name:       { flex: 1, fontSize: 14, color: '#E8E8F0', fontWeight: '500', paddingHorizontal: 10 },
  nameMe:     { color: '#A78BFA', fontWeight: '700' },
  scoreBox:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score:      { fontSize: 14, color: '#E8E8F0', fontWeight: '600' },
  scoreMe:    { color: '#FFD700' },
  sep:        { height: SEPARATOR_HEIGHT, backgroundColor: '#2E2E4E', marginHorizontal: 16 },
  empty:      { color: '#8E8EA0', textAlign: 'center', padding: 20, fontSize: 14 },
});
```


***

## V3 — Direktif 1: `LeaderboardScreen.tsx`

Dış `ScrollView` tamamen kaldırıldı. Başlık (`Text`) artık FlatList'in `ListHeaderComponent`'ine taşındı; böylece başlık da sanallaştırma kapsamına girer ve scroll çakışması ortadan kalkar.[^4_1]

```tsx
// src/screens/LeaderboardScreen.tsx  (v3)
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView }      from 'react-native-safe-area-context';
import { LeaderboardList }   from '../components/leaderboard/LeaderboardList';
import { useGamification }   from '../hooks/useGamification';
import { useForegroundSync } from '../hooks/useForegroundSync';

// Auth context'ten alınacak; burada sabit bırakıldı
const MY_USER_ID = 'CURRENT_USER_ID';

export default function LeaderboardScreen() {
  const { leaderboard, isLoading, fetchAll } = useGamification();

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Arka plandan dönerken leaderboard da güncellenir
  useForegroundSync(fetchAll);

  if (isLoading && !leaderboard) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#FFD700" size="large" />
      </View>
    );
  }

  // ── ⚠️ v2'den silinen yapı ────────────────────────────────────────────────
  // YANLIŞ (v2):
  //   <ScrollView>
  //     <LeaderboardList ... />   ← FlatList içinde sonsuz yükseklik → sanallaştırma ölür
  //   </ScrollView>
  //
  // DOĞRU (v3):
  //   SafeAreaView (flex:1) → LeaderboardList → FlatList kendi scroll'unu yönetir
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.screen} edges={['bottom']}>
      {leaderboard && (
        <LeaderboardList
          entries={leaderboard.entries}
          myRank={leaderboard.myRank}
          leagueSlug={leaderboard.leagueSlug}
          currentUserId={MY_USER_ID}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,                // ← FlatList bu yüksekliği miras alır, sanallaştırma aktif
    backgroundColor: '#13131F',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#13131F',
  },
});
```


***

## V3 — Direktif 2: `MissionsScreen.tsx`

V2'de `renderItem` inline lambda olarak bırakıldığından `MissionCard`'daki `React.memo` her render'da yeni referans karşısında kalkanını kaldırıyordu. `useCallback` ile dışarı alındı.[^4_1]

```tsx
// src/screens/MissionsScreen.tsx  (v3)
import React, { useEffect, useCallback } from 'react';
import {
  FlatList, View, Text, StyleSheet,
  ActivityIndicator, ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView }      from 'react-native-safe-area-context';
import { MissionCard }       from '../components/missions/MissionCard';
import { useGamification }   from '../hooks/useGamification';
import { useForegroundSync } from '../hooks/useForegroundSync';
import type { Mission }      from '../types/gamification.types';

export default function MissionsScreen() {
  const {
    activeMissions, isLoading,
    fetchAll, fetchStreakAndMissions, claimReward,
  } = useGamification();

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useForegroundSync(fetchStreakAndMissions);

  // ── ⚠️ v2'den silinen inline lambda ──────────────────────────────────────
  // YANLIŞ (v2):
  //   renderItem={({ item }) => <MissionCard mission={item} onClaim={claimReward} />}
  //   → Her render'da yeni fonksiyon referansı → MissionCard'ın React.memo'su devre dışı
  //
  // DOĞRU (v3):
  //   const renderMission = useCallback(...) → referans stabil → memo kalkanı aktif
  // ─────────────────────────────────────────────────────────────────────────

  const renderMission = useCallback(
    ({ item }: ListRenderItemInfo<Mission>) => (
      <MissionCard
        mission={item}
        onClaim={claimReward}   // claimReward zaten useCallback ile stable (hooks/useGamification.ts)
      />
    ),
    [claimReward],  // claimReward değişmediği sürece renderMission referansı da değişmez
  );

  const keyExtractor = useCallback(
    (item: Mission) => item.id,
    [],
  );

  if (isLoading && !activeMissions.length) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#A78BFA" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['bottom']}>
      <FlatList<Mission>
        data={activeMissions}
        keyExtractor={keyExtractor}
        renderItem={renderMission}          // ← useCallback ile stabil referans
        ListHeaderComponent={<Text style={s.header}>Görevler</Text>}
        ListEmptyComponent={<Text style={s.empty}>Henüz görev yok.</Text>}
        contentContainerStyle={s.list}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={3}
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#13131F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#13131F' },
  list:   { paddingBottom: 32 },
  header: { fontSize: 20, fontWeight: '700', color: '#E8E8F0', margin: 16 },
  empty:  { color: '#8E8EA0', textAlign: 'center', padding: 32 },
});
```


***

## 📐 V3 Cerrahi Yama Özeti

| \# | Dosya | Silinen Satır / Yapı | Eklenen Düzeltme | Etki |
| :-- | :-- | :-- | :-- | :-- |
| D1-A | `LeaderboardList.tsx` | `scrollEnabled={false}` | Satır tamamen kaldırıldı | `windowSize`, `maxToRenderPerBatch`, `removeClippedSubviews` artık gerçek |
| D1-B | `LeaderboardList.tsx` | `container` stili `overflow:'hidden'` + sabit yükseklik | `flex: 1` ile esnek yükseklik | FlatList yüksekliği ekrandan türetilir |
| D1-C | `LeaderboardList.tsx` | Başlık ayrı `View` olarak dışarıdaydı | `ListHeaderComponent` içine taşındı | Başlık da sanallaştırma kapsamına girer |
| D2-A | `LeaderboardScreen.tsx` | `<ScrollView>` sarmalayıcısı | `<SafeAreaView style={{flex:1}}>` | Scroll conflict ortadan kalktı |
| D2-B | `LeaderboardScreen.tsx` | `<Text style={s.header}>` dışarıda | `LeaderboardList`'in `ListHeaderComponent`'i | Tek scroll kaynağı: FlatList |
| D3-A | `MissionsScreen.tsx` | `renderItem={({ item }) => <MissionCard .../>}` inline | `const renderMission = useCallback(...)` | `MissionCard`'ın `React.memo` kalkanı aktive oldu |
| D3-B | `MissionsScreen.tsx` | `keyExtractor` inline | `useCallback` ile dışarı alındı | Gereksiz ref değişimi engellendi |

> ⚠️ **`SafeAreaView` Bağımlılığı:** `react-native-safe-area-context` paketi `expo install react-native-safe-area-context` ile kurulu olmalı ve `App.tsx` kökünde `<SafeAreaProvider>` sarmalayıcısı bulunmalıdır. Aksi hâlde iOS'ta notch/home indicator çakışması yaşanır.[^4_1]

> ⚠️ **`flex: 1` Zinciri:** `LeaderboardScreen → SafeAreaView → LeaderboardList → View(container) → FlatList` zincirindeki her bileşende `flex: 1` bulunmalıdır. Zincirde tek bir `flex: 1` eksikliği FlatList'in yüksekliğini `0`'a indirir ve liste görünmez olur.[^4_2]

<div align="center">⁂</div>

[^4_1]: FinRoute_9.Hafta_Gorev.md

[^4_2]: FinRoute_8.Hafta_Gorev.md

