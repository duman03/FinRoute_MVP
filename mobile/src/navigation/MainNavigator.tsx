import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import PortfolioScreen from '../screens/PortfolioScreen';
import GamificationScreen from '../screens/GamificationScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import SettingsScreen from '../screens/SettingsScreen';

type MainTabParamList = {
  Portföy: undefined;
  Görevler: undefined;
  Lig: undefined;
  Ayarlar: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Her sekme React.memo ile sarılı — gereksiz render yok
const MemoPortfolio = React.memo(PortfolioScreen);
const MemoGamification = React.memo(GamificationScreen);
const MemoLeaderboard = React.memo(LeaderboardScreen);
const MemoSettings = React.memo(SettingsScreen);

export default function MainNavigator() {
  // Zustand granüler okuma — Altın Kural
  const authStatus = useAuthStore(s => s.authStatus);

  // AUTHENTICATED değilse null döndür
  if (authStatus !== 'AUTHENTICATED') return null;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0F172A' },
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#94A3B8',
      }}
    >
      <Tab.Screen
        name="Portföy"
        component={MemoPortfolio}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Görevler"
        component={MemoGamification}
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="star-outline" color={color} size={24} />
          ),
        }}
      />
      <Tab.Screen
        name="Lig"
        component={MemoLeaderboard}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Ayarlar"
        component={MemoSettings}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
