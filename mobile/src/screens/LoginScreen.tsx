import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { axiosInstance } from '../api/axiosInstance';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Lütfen tüm alanları doldurun.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const response = await axiosInstance.post('/auth/login', {
        email: email.trim(),
        password: password
      });

      const resData = response.data.data || response.data;
      const { accessToken, refreshToken, user } = resData;

      if (accessToken && refreshToken && user?.id) {
        await setAuth({
          accessToken,
          refreshToken,
          userId: user.id,
          user: { displayName: user.displayName, email: user.email }
        });
      } else {
        throw new Error('Sunucudan geçersiz yanıt alındı.');
      }

    } catch (error: any) {
      console.error('Giriş Hatası Detayı:', error);

      let message = 'Sunucuya bağlanılamadı (Network Error)';
      const errData = error.response?.data;
      if (errData?.error) {
        const errCode = errData.error;
        if (typeof errCode === 'string') {
          if (errCode === 'MISSING_FIELDS') message = 'Lütfen tüm alanları doldurun.';
          else message = errCode;
        } else if (errCode.code) {
          if (errCode.code === 'INVALID_CREDENTIALS') message = 'Geçersiz e-posta veya şifre.';
          else if (errCode.code === 'ACCOUNT_DEACTIVATED') message = 'Hesabınız devre dışı bırakılmış.';
          else message = errCode.message || message;
        }
      } else if (errData?.message) {
        message = errData.message;
      }

      setErrorMsg(message);
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.loginContainer}
    >
      <View style={styles.loginCard}>
        <Text style={styles.loginTitle}>Giriş Yap</Text>
        <Text style={styles.loginSubtitle}>FinRoute dünyasına hoş geldiniz</Text>

        {errorMsg ? <View style={styles.errorBox}><Text style={styles.loginError}>{errorMsg}</Text></View> : null}

        <TextInput
          style={styles.input}
          placeholder="E-posta Adresi"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Şifre"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.disabledButton]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.loginButtonText}>Devam Et</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggleModeButton}
          onPress={() => navigation.navigate('Register')}
          disabled={isLoading}
        >
          <Text style={styles.toggleModeText}>
            Hesabınız yok mu? Kayıt Olun
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    ...Platform.select({
      web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.04)' as any },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 24, elevation: 3 },
    }),
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  loginSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 32,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  loginError: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 16,
  },
  loginButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: { opacity: 0.7 },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  toggleModeButton: { marginTop: 16, alignItems: 'center', padding: 8 },
  toggleModeText: { color: '#4F46E5', fontSize: 14, fontWeight: '500' },
});
