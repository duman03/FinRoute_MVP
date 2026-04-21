import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useGamificationStore } from '../../store/gamificationStore'
import { postCheckIn } from '../../api/gamification.api'
import type { StreakInfo, XpProfile } from '../../types/gamification.types'

// ─── Prop tipleri — memo comparator için açık tanım ──────────────────────────
interface StreakWidgetProps {
  streak: StreakInfo
  xpProfile: XpProfile
}

// ─── İç bileşen — store yerine prop alır; GamificationScreen granüler okur ──
const StreakWidgetBase: React.FC<StreakWidgetProps> = ({ streak, xpProfile }) => {
  const setStreak = useGamificationStore(s => s.setStreak)
  const [loading, setLoading] = useState(false)

  const handleCheckIn = useCallback(async () => {
    if (loading || streak.todayCheckedIn) return
    setLoading(true)
    try {
      const result = await postCheckIn()
      // 409 ALREADYCHECKEDIN dahil — idempotent, sessizce kabul ──────────────
      setStreak({
        ...streak,
        currentStreak: result.alreadyCheckedIn
          ? streak.currentStreak
          : result.newStreak,
        freezeRemaining: result.freezeRemaining,
        todayCheckedIn: true,
      })
    } catch {
      // Gerçek ağ hatası — kullanıcıyı rahatsız etme, sessizce geç
    } finally {
      setLoading(false)
    }
  }, [loading, streak, setStreak])

  return (
    <View
      style={[
        styles.container,
        streak.todayCheckedIn && styles.containerDone,
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.stat}>🔥 {streak.currentStreak} gün</Text>
        <Text style={styles.stat}>⚡ {xpProfile.totalXp} XP</Text>
        <Text style={styles.stat}>🛡️ {streak.freezeRemaining}</Text>
      </View>

      {streak.todayCheckedIn ? (
        <Text style={styles.doneText}>Bugün tamamlandı ✓</Text>
      ) : (
        <TouchableOpacity
          style={styles.button}
          onPress={handleCheckIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>Bugün check-in yap</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── React.memo + custom comparator ──────────────────────────────────────────
// Yalnızca currentStreak veya todayCheckedIn değişince yeniden render tetiklenir
export const StreakWidget = React.memo(
  StreakWidgetBase,
  (prev, next) =>
    prev.streak.currentStreak === next.streak.currentStreak &&
    prev.streak.todayCheckedIn === next.streak.todayCheckedIn &&
    prev.xpProfile.totalXp === next.xpProfile.totalXp &&
    prev.streak.freezeRemaining === next.streak.freezeRemaining
)

// ─── Styles — "Quiet Luxury" tasarım dili ────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  containerDone: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  stat: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.1,
  },
  doneText: {
    textAlign: 'center',
    color: '#10B981',
    fontWeight: '700',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
})
