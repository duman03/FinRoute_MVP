import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Check, Loader2 } from 'lucide-react-native';
import type { Mission } from '../../types/gamification.types';

interface MissionCardProps {
  mission: Mission;
  onClaim: (id: string) => Promise<void>;
}

export const MissionCard: React.FC<MissionCardProps> = ({ mission, onClaim }) => {
  const [claiming, setClaiming] = React.useState(false);

  const isCompleted = mission.status === 'COMPLETED';
  const isClaimed = mission.status === 'CLAIMED';

  const handleClaim = async () => {
    if (claiming || !isCompleted) return;
    setClaiming(true);
    try {
      await onClaim(mission.id);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <View style={[styles.card, isClaimed && styles.cardClaimed]}>
      <View style={styles.leftCol}>
        <Text style={[styles.title, isClaimed && styles.textMuted]}>{mission.title}</Text>
        <Text style={[styles.description, isClaimed && styles.textMuted]} numberOfLines={2}>
          {mission.description}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.barBg}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.min(100, (mission.progressCount / mission.targetCount) * 100)}%` },
                isCompleted && styles.barComplete,
                isClaimed && styles.barClaimed,
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {mission.progressCount}/{mission.targetCount}
          </Text>
        </View>
      </View>

      <View style={styles.rightCol}>
        {isClaimed ? (
          <View style={styles.claimedBadge}>
            <Check size={16} color="#10B981" />
          </View>
        ) : isCompleted ? (
          <TouchableOpacity
            style={styles.claimButton}
            onPress={handleClaim}
            disabled={claiming}
          >
            {claiming ? (
              <Loader2 size={16} color="#FFFFFF" style={styles.spin} />
            ) : (
              <Text style={styles.claimButtonText}>Al</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.rewardBadge}>
            <Text style={styles.rewardText}>+{mission.xpReward} XP</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' },
      default: { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  cardClaimed: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    opacity: 0.8,
  },
  leftCol: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  textMuted: {
    color: '#9CA3AF',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  barComplete: {
    backgroundColor: '#10B981',
  },
  barClaimed: {
    backgroundColor: '#9CA3AF',
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 35,
    textAlign: 'right',
  },
  rightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  claimButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  claimedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rewardText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  spin: {
    // Basic rotation for Loader2 if possible, otherwise just a static icon
  },
});
