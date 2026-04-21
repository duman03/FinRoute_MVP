import React, { useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  ListRenderItem,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { useGamification } from '../hooks/useGamification'
import { useGamificationStore } from '../store/gamificationStore'
import { claimMissionReward } from '../api/gamification.api'
import { MissionCard } from '../components/gamification/MissionCard'
import { StreakWidget } from '../components/gamification/StreakWidget'
import type { Mission } from '../types/gamification.types'

// ─── Sabit yükseklik — getItemLayout O(1) için zorunlu ───────────────────────
const MISSION_ITEM_HEIGHT = 88

// ─── Lig badge tanımları ──────────────────────────────────────────────────────
const LEAGUE_DISPLAY: Record<string, { label: string; color: string }> = {
  bronze: { label: '🥉 Bronz Lig', color: '#CD7F32' },
  silver: { label: '🥈 Gümüş Lig', color: '#94A3B8' },
  gold: { label: '🥇 Altın Lig', color: '#F59E0B' },
  diamond: { label: '💎 Elmas Lig', color: '#6366F1' },
}

// ─── XP seviye eşiği hesabı ───────────────────────────────────────────────────
function nextLevelXpThreshold(level: number): number {
  return (level + 1) * 500
}

export default function GamificationScreen() {
  const {
    streak,
    xpProfile,
    activeMissions,
    isLoading,
    error,
    fetchAll,
  } = useGamification()

  // Correcting store selector types based on our implementation
  const setActiveMissions = useGamificationStore(s => s.setActiveMissions)
  const setXpProfile = useGamificationStore(s => s.setXpProfile)
  const currentLeague = useGamificationStore(s => s.currentLeague)

  // ─── onClaim callback ─────────────────────────────────────────────────────
  const handleClaim = useCallback(
    async (missionId: string) => {
      try {
        const { xpAwarded } = await claimMissionReward(missionId)

        // Local store güncelle — CLAIMED olarak işaretle
        setActiveMissions(
          (activeMissions ?? []).map(m =>
            m.id === missionId ? { ...m, status: 'CLAIMED' as const } : m
          )
        )

        // XP artışını local store'a yansıt
        if (xpProfile) {
          setXpProfile({
            ...xpProfile,
            totalXp: xpProfile.totalXp + xpAwarded,
            weeklyXp: xpProfile.weeklyXp + xpAwarded,
          })
        }
      } catch {
        Alert.alert('Hata', 'Ödül alınamadı. Lütfen tekrar dene.')
      }
    },
    [activeMissions, xpProfile, setActiveMissions, setXpProfile]
  )

  // ─── renderItem — useCallback ile inline lambda koruması ─────────────────
  const renderMission = useCallback<ListRenderItem<Mission>>(
    ({ item }) => (
      <MissionCard mission={item} onClaim={handleClaim} />
    ),
    [handleClaim]
  )

  const keyExtractor = useCallback((item: Mission) => item.id, [])

  const getItemLayout = useCallback(
    (_: ArrayLike<Mission> | null | undefined, index: number) => ({
      length: MISSION_ITEM_HEIGHT,
      offset: MISSION_ITEM_HEIGHT * index,
      index,
    }),
    []
  )

  // ─── Yükleniyor durumu ────────────────────────────────────────────────────
  if (isLoading && !activeMissions?.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" size="large" />
      </View>
    )
  }

  // ─── Hata durumu ──────────────────────────────────────────────────────────
  if (error && !activeMissions?.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchAll}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ─── ListHeaderComponent — StreakWidget + XP bar + League badge ───────────
  const ListHeader = () => (
    <View>
      {streak && xpProfile && (
        <StreakWidget streak={streak} xpProfile={xpProfile} />
      )}

      {xpProfile && (
        <View style={styles.xpBarContainer}>
          <View style={styles.xpBarRow}>
            <Text style={styles.xpBarLabel}>
              Haftalık XP: {xpProfile.weeklyXp}
            </Text>
            <Text style={styles.xpBarLabel}>
              Seviye {xpProfile.level}
            </Text>
          </View>
          <View style={styles.xpBarBg}>
            <View
              style={[
                styles.xpBarFill,
                {
                  width: `${Math.min(
                    (xpProfile.weeklyXp /
                      nextLevelXpThreshold(xpProfile.level)) *
                    100,
                    100
                  )}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {currentLeague && LEAGUE_DISPLAY[currentLeague] && (
        <View
          style={[
            styles.leagueBadge,
            { borderColor: LEAGUE_DISPLAY[currentLeague].color },
          ]}
        >
          <Text
            style={[
              styles.leagueText,
              { color: LEAGUE_DISPLAY[currentLeague].color },
            ]}
          >
            {LEAGUE_DISPLAY[currentLeague].label}
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Aktif Görevler</Text>
    </View>
  )

  return (
    <FlatList<Mission>
      data={activeMissions ?? []}
      keyExtractor={keyExtractor}
      renderItem={renderMission}
      getItemLayout={getItemLayout}
      initialNumToRender={10}
      windowSize={5}
      removeClippedSubviews
      ListHeaderComponent={<ListHeader />}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  list: {
    paddingBottom: 32,
    backgroundColor: '#F9FAFB',
  },
  xpBarContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  xpBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  xpBarLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  xpBarBg: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 8,
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  leagueBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  leagueText: {
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginHorizontal: 16,
    marginBottom: 8,
  },
})
