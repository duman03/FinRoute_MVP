import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  FlatList,
  Platform
} from 'react-native';
import { useGamificationStore } from '../store/gamificationStore';
import { NotificationSettings } from '../components/NotificationSettings';

export const GamificationProfileScreen: React.FC = () => {
  // 🚀 ADIM 1: Store'dan gerçek verileri ve fonksiyonları çekiyoruz
  // Az önceki sahte (local) değişkenleri tamamen temizledik.
  const {
    streakInfo,
    xpProfile,
    recentEvents,
    loading,
    error,
    loadGamificationProfile
  } = useGamificationStore();

  useEffect(() => {
    // 🚀 ADIM 2: API çağrısını aktif ediyoruz
    // Bu fonksiyon axiosInstance kullanarak backend'deki /gamification/profile ucuna gider.
    loadGamificationProfile();
  }, [loadGamificationProfile]);

  // Yükleme durumu (Sadece ilk veri çekilirken gösterilir)
  if (loading && !xpProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </SafeAreaView>
    );
  }

  // Hata durumu (Backend 401 dönerse veya bağlantı koparsa burası çalışır)
  if (error && !xpProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Veriler yüklenemedi. Lütfen tekrar deneyin.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Son aktiviteler listesi için render fonksiyonu
  const renderRecentEvent = ({ item }: { item: any }) => {
    const isGain = item.xp > 0;
    return (
      <View style={styles.eventRow}>
        <Text style={styles.eventSource}>
          {item.source ? item.source.replace(/_/g, ' ') : 'Aktivite'}
        </Text>
        <Text style={[styles.eventXp, isGain ? styles.xpGain : styles.xpLoss]}>
          {isGain ? '+' : ''}{item.xp} XP
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Oyunlaştırma Profili</Text>
          <Text style={styles.headerSubtitle}>İlerlemenizi ve başarılarınızı takip edin.</Text>
        </View>

        {/* Level & XP Card */}
        {xpProfile && (
          <View style={[styles.card, styles.xpCard]}>
            <View style={styles.levelRow}>
              <Text style={styles.levelName}>{xpProfile.levelName}</Text>
              <Text style={styles.levelValue}>Sv. {xpProfile.level}</Text>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.max(0,
                        ((xpProfile.totalXp - (xpProfile.currentLevelXp ?? 0)) /
                          ((xpProfile.nextLevelXp ?? (xpProfile.totalXp + 1)) - (xpProfile.currentLevelXp ?? 0))) * 100
                      ))}%`
                    }
                  ]}
                />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressText}>{xpProfile.totalXp} XP</Text>
                <Text style={styles.progressText}>{xpProfile.nextLevelXp ?? 0} XP</Text>
              </View>
            </View>
          </View>
        )}

        {/* Streak Info Grid */}
        {streakInfo && (
          <View style={styles.streakGrid}>
            <View style={styles.streakCard}>
              <Text style={styles.streakValue}>{streakInfo.currentStreak}</Text>
              <Text style={styles.streakLabel}>Günlük Seri</Text>
            </View>

            <View style={styles.streakCard}>
              <Text style={styles.streakValue}>{streakInfo.longestStreak}</Text>
              <Text style={styles.streakLabel}>En İyi Seri</Text>
            </View>

            <View style={[styles.streakCard, streakInfo.freezeRemaining > 0 && styles.streakCardActive]}>
              <Text style={[styles.streakValue, streakInfo.freezeRemaining > 0 && styles.streakValueActive]}>
                {streakInfo.freezeRemaining}
              </Text>
              <Text style={[styles.streakLabel, streakInfo.freezeRemaining > 0 && styles.streakLabelActive]}>
                Buz Hakkı
              </Text>
            </View>
          </View>
        )}

        {/* Bildirim Ayarları Bileşeni */}
        <NotificationSettings />

        {/* Recent Events */}
        {recentEvents && recentEvents.length > 0 && (
          <View style={styles.recentEventsContainer}>
            <Text style={styles.sectionTitle}>Son Aktiviteler</Text>
            <View style={styles.card}>
              <FlatList
                data={recentEvents}
                keyExtractor={(item, index) => `${item.createdAt}-${index}`}
                renderItem={renderRecentEvent}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 15,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    marginTop: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 24px rgba(0,0,0,0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 24,
        elevation: 3,
      },
    }),
  },
  xpCard: {
    marginBottom: 24,
    backgroundColor: '#111827',
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  levelName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  levelValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  progressText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  streakGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  streakCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 12px rgba(0,0,0,0.03)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 12,
        elevation: 1,
      },
    }),
  },
  streakCardActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  streakValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  streakValueActive: {
    color: '#4F46E5',
  },
  streakLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  streakLabelActive: {
    color: '#6366F1',
  },
  recentEventsContainer: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  eventSource: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  eventXp: {
    fontSize: 15,
    fontWeight: '600',
  },
  xpGain: {
    color: '#10B981',
  },
  xpLoss: {
    color: '#EF4444',
  },
});