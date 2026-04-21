import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native'
import { jwtDecode } from 'jwt-decode'           // jwt-decode v4 — named import
import * as SecureStore from 'expo-secure-store'
import { useGamification } from '../hooks/useGamification'
import { useGamificationStore } from '../store/gamificationStore'
import { useAuthStore } from '../store/authStore'
import { LeaderboardList } from '../components/leaderboard/LeaderboardList'
import { getLeaderboard } from '../api/gamification.api'

type TabType = 'global' | 'league'

// ─── Lig badge tanımları ──────────────────────────────────────────────────────
const LEAGUE_ICON: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
}

export default function LeaderboardScreen() {
  const { isLoading } = useGamification()

  // ─── Granüler store okumaları ─────────────────────────────────────────────
  const leaderboard = useGamificationStore(s => s.leaderboard)
  const setLeaderboard = useGamificationStore(s => s.setLeaderboard)
  const currentLeague = useGamificationStore(s => s.currentLeague)

  // ─── JWT'den gerçek userId — authStore VEYA SecureStore fallback ──────────
  // YANLIŞ (Week 10 güvenlik açığı):  const MYUSERID = 'CURRENTUSERID'
  // DOĞRU: authStore'dan userId; yoksa JWT decode ile al
  const authStoreUserId = useAuthStore(s => s.userId)
  const [ currentUserId, setCurrentUserId ] = useState<string | null>(
    authStoreUserId
  )

  useEffect(() => {
    if (authStoreUserId) {
      setCurrentUserId(authStoreUserId)
      return
    }
    // authStore'da yoksa SecureStore'dan JWT decode — fallback
    ;(async () => {
      try {
        const token = await SecureStore.getItemAsync('refreshtoken')
        if (token) {
          const decoded = jwtDecode<{ sub: string }>(token)
          setCurrentUserId(decoded.sub)
        }
      } catch (err) {
        console.error('JWT decode failed', err)
      }
    })()
  }, [ authStoreUserId ])

  // ─── Sekme yönetimi ───────────────────────────────────────────────────────
  const [ activeTab, setActiveTab ] = useState<TabType>('global')
  const [ tabLoading, setTabLoading ] = useState(false)

  const handleTabChange = useCallback(
    async (tab: TabType) => {
      if (tab === activeTab) return
      setActiveTab(tab)
      setTabLoading(true)
      try {
        const data = await getLeaderboard(tab)
        setLeaderboard(data)
      } catch {
        // Hata durumunda mevcut veriyi koru
      } finally {
        setTabLoading(false)
      }
    },
    [ activeTab, setLeaderboard ]
  )

  // ─── Yükleniyor ───────────────────────────────────────────────────────────
  if (isLoading && !leaderboard) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Lig bilgisi */}
      {currentLeague && (
        <View style={styles.leagueHeader}>
          <Text style={styles.leagueHeaderText}>
            {LEAGUE_ICON[ currentLeague ] ?? '🏆'} Kendi ligim:{' '}
            <Text style={styles.leagueSlugText}>
              {currentLeague.charAt(0).toUpperCase() + currentLeague.slice(1)}
            </Text>
          </Text>
        </View>
      )}

      {/* Sekme seçici */}
      <View style={styles.tabRow}>
        {([ 'global', 'league' ] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              activeTab === tab && styles.tabButtonActive,
            ]}
            onPress={() => handleTabChange(tab)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === 'global' ? 'Global' : 'Lig'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Liste */}
      {tabLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6366F1" size="small" />
        </View>
      ) : (
        <LeaderboardList
          entries={leaderboard?.entries ?? []}
          myRank={leaderboard?.myRank ?? null}
          leagueSlug={leaderboard?.leagueSlug ?? null}
          currentUserId={currentUserId ?? ''}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leagueHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  leagueHeaderText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  leagueSlugText: {
    color: '#6366F1',
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: '0px 1px 2px rgba(0,0,0,0.08)' as any },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: '#6366F1',
  },
})
