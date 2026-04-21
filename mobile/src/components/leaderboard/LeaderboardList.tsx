import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
} from 'react-native';
import type { LeaderboardEntry } from '../../types/gamification.types';

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  myRank: number | null;
  leagueSlug: string | null;
  currentUserId: string;
}

const RANK_COLORS: Record<number, string> = {
  1: '#F59E0B', // Gold
  2: '#94A3B8', // Silver
  3: '#B45309', // Bronze (Amber-700)
};

export const LeaderboardList: React.FC<LeaderboardListProps> = ({
  entries,
  currentUserId,
}) => {
  const renderItem = ({ item }: { item: LeaderboardEntry }) => {
    const isMe = item.userId === currentUserId;
    const rankColor = RANK_COLORS[ item.rank ] || '#6B7280';

    return (
      <View style={[styles.row, isMe && styles.myRow]}>
        <View style={styles.rankCol}>
          <Text style={[styles.rankText, { color: rankColor }]}>#{item.rank}</Text>
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.nameText, isMe && styles.myNameText]}>
            {item.displayName} {isMe && '(Sen)'}
          </Text>
        </View>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreText}>{item.score} XP</Text>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.userId}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Henüz veri bulunmuyor.</Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  myRow: {
    backgroundColor: '#EEF2FF',
    borderBottomColor: '#C7D2FE',
  },
  rankCol: {
    width: 50,
  },
  rankText: {
    fontSize: 15,
    fontWeight: '800',
  },
  nameCol: {
    flex: 1,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  myNameText: {
    fontWeight: '700',
    color: '#4F46E5',
  },
  scoreCol: {
    alignItems: 'flex-end',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
});
