const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const hasGoogleServices = fs.existsSync(path.join(projectRoot, 'google-services.json'));
const hasGoogleServiceInfo = fs.existsSync(path.join(projectRoot, 'GoogleService-Info.plist'));
const easProjectId = process.env.EAS_PROJECT_ID;

const expoConfig = {
  name: 'FinRoute',
  slug: 'finroute-mvp',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'finroute',
  description: 'FinRoute, sanal portföy yönetimi ve canlı piyasa takibi sunan mobil finans simülasyon uygulamasıdır.',
  extra: {
    eas: easProjectId ? { projectId: easProjectId } : undefined,
  },
  splash: {
    backgroundColor: '#0F172A',
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
  },
  ios: {
    bundleIdentifier: 'com.finroute.mvp',
    buildNumber: '1',
    supportsTablet: false,
    infoPlist: {
      NSUserNotificationUsageDescription: 'Streak hatırlatıcıları ve lig bildirimleri için bildirim izni gerekir.',
    },
    ...(hasGoogleServiceInfo ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
  },
  android: {
    package: 'com.finroute.mvp',
    versionCode: 1,
    permissions: ['NOTIFICATIONS'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0F172A',
    },
    ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
  },
  plugins: [
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#6366F1',
      },
    ],
  ],
};

module.exports = { expo: expoConfig };
