import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
// Named import olarak düzeltildi (Projemizin kuralları gereği)
import { axiosInstance } from '../api/axiosInstance';
import { useAuthStore } from '../store/authStore';

// ── Tipler ──────────────────────────────────────────────────────────────────
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; displayName: string };
}

type FieldErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  general?: string;
};

// ── Sabitler ────────────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BACKEND_ERRORS: Record<string, string> = {
  EMAIL_ALREADY_IN_USE: 'Bu e-posta adresi zaten kullanımda.',
  MISSING_FIELDS: 'Lütfen tüm alanları doldurun.',
  PASSWORD_TOO_SHORT: 'Şifre en az 8 karakter olmalıdır.',
  INTERNAL_SERVER_ERROR: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.',
};

// ── Bileşen ─────────────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Zustand setAuth aksiyonunu alıyoruz (Step 2'de tanımladığımız yeni yapı)
  const { setAuth } = useAuthStore();

  // ── Validasyon ──────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const next: FieldErrors = {};

    if (!displayName.trim()) {
      next.displayName = 'Ad Soyad boş bırakılamaz.';
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      next.email = 'Geçerli bir e-posta adresi girin.';
    }
    if (password.length < 8) {
      next.password = 'Şifre en az 8 karakter olmalıdır.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [displayName, email, password]);

  // ── Kayıt İsteği ────────────────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    if (!validate()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const response = await axiosInstance.post<RegisterResponse>(
        '/auth/register',
        {
          displayName: displayName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }
      );

      const { accessToken, refreshToken, user } = response.data;

      // Yeni authStore yapımıza göre tokenları güvenli depoya (SecureStore) yazıyoruz
      // Bu işlem isLoggedIn'i true yapacak ve App.tsx otomatik yönlendirecektir.
      await setAuth({
        accessToken,
        refreshToken,
        userId: user.id,
        user: {
          displayName: user.displayName,
          email: email.trim().toLowerCase(),
        },
      });

      // RegisterScreen.tsx içindeki catch bloğunu şöyle güncelle:
      // RegisterScreen.tsx içindeki catch bloğunu şununla değiştir:
      // RegisterScreen.tsx içindeki catch bloğunu tamamen şununla değiştir:
    } catch (err: any) {
      const backendResponse = err?.response?.data;

      // 1. KONSOLA HAM VERİYİ BAS (En kesin çözüm burada yatar)
      console.log("--- BACKEND HATASI ---");
      console.dir(backendResponse);
      console.log("----------------------");

      // 2. HATAYI AYIKLA
      // Backend genelde ya { error: "KOD" } ya da { message: "MESAJ" } döner.
      // NestJS ise bazen message: ["Hata 1", "Hata 2"] şeklinde dizi döner.
      let errorCode = "";

      if (typeof backendResponse === 'string') {
        errorCode = backendResponse;
      } else if (backendResponse?.error) {
        errorCode = backendResponse.error;
      } else if (backendResponse?.message) {
        errorCode = Array.isArray(backendResponse.message) ? backendResponse.message[0] : backendResponse.message;
      }

      // 3. MESAJI BELİRLE
      // Eğer listemizde yoksa ham errorCode'u göster ki ne olduğunu anlayalım
      const message = BACKEND_ERRORS[errorCode] || `Sunucu Yanıtı: ${JSON.stringify(errorCode)}`;

      setErrors({ general: message });
    } finally {
      setIsLoading(false);
    }
  }, [displayName, email, password, validate, setAuth]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo / Başlık ───────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.brand}>FinRoute</Text>
          <Text style={styles.pageTitle}>Hesap Oluştur</Text>
          <Text style={styles.pageSubtitle}>
            Finansal geleceğini yönetmeye başla.
          </Text>
        </View>

        {/* ── Kart ────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          {/* Genel hata banner */}
          {errors.general ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          ) : null}

          {/* Ad Soyad */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Ad Soyad</Text>
            <TextInput
              style={[
                styles.input,
                errors.displayName ? styles.inputError : undefined,
              ]}
              placeholder="Adınız Soyadınız"
              placeholderTextColor="#9CA3AF"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
            />
            {errors.displayName ? (
              <Text style={styles.fieldError}>{errors.displayName}</Text>
            ) : null}
          </View>

          {/* E-posta */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={[
                styles.input,
                errors.email ? styles.inputError : undefined,
              ]}
              placeholder="ornek@email.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!isLoading}
            />
            {errors.email ? (
              <Text style={styles.fieldError}>{errors.email}</Text>
            ) : null}
          </View>

          {/* Şifre */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Şifre</Text>
            <TextInput
              style={[
                styles.input,
                errors.password ? styles.inputError : undefined,
              ]}
              placeholder="En az 8 karakter"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              editable={!isLoading}
            />
            {errors.password ? (
              <Text style={styles.fieldError}>{errors.password}</Text>
            ) : null}
          </View>

          {/* Kayıt Ol Butonu */}
          <TouchableOpacity
            style={[
              styles.button,
              isLoading ? styles.buttonDisabled : undefined,
            ]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Kayıt Ol</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Giriş Yap Linki */}
        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.navigate('Login')}
          disabled={isLoading}
        >
          <Text style={styles.loginLinkText}>
            Zaten hesabın var mı?{' '}
            <Text style={styles.loginLinkBold}>Giriş Yap</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Stiller: Quiet Luxury ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brand: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -1,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '400',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 24px rgba(0,0,0,0.06)',
      },
      default: {
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
      },
    }),
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  },
  inputError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  fieldError: {
    marginTop: 6,
    fontSize: 12,
    color: '#DC2626',
  },
  button: {
    backgroundColor: '#4F46E5', // Indigo
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 32,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#6B7280',
  },
  loginLinkBold: {
    color: '#4F46E5',
    fontWeight: '600',
  },
});
