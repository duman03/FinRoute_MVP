import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useUserStore } from '../store/userStore';
import { updateNotificationPreferences } from '../api/userService';

export const NotificationSettings: React.FC = () => {
  const { profile, updateLocally } = useUserStore();
  const [isUpdating, setIsUpdating] = useState(false);

  const notificationsEnabled = profile?.notificationsEnabled ?? false;

  const toggleSwitch = async (value: boolean) => {
    setIsUpdating(true);
    try {
      await updateNotificationPreferences(value);
      updateLocally({ notificationsEnabled: value });
    } catch (error) {
      console.warn('Failed to update notification preferences:', error);
      // Revert in case of failure is handled by not updating locally
    } finally {
      setIsUpdating(false);
    }
  };

  if (!profile) return null;

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.title}>Bildirimler</Text>
        <Text style={styles.subtitle}>
          Seri uyarıları ve lig yükselme bilgilendirmeleri alın.
        </Text>
      </View>
      {isUpdating ? (
        <ActivityIndicator color="#111827" size="small" />
      ) : (
        <Switch
          trackColor={{ false: '#E5E7EB', true: '#111827' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#E5E7EB"
          onValueChange={toggleSwitch}
          value={notificationsEnabled}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    // Sisteme sadık, Web ve Mobil için dinamik gölge adaptasyonu
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 12px rgba(0,0,0,0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
});