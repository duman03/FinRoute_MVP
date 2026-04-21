import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';
import { axiosInstance } from '../api/axiosInstance';

const DELETE_CONFIRMATION = 'HESABIMI SİL';

function getInitial(name: string): string {
  if (!name) return 'U';
  return name.trim().charAt(0).toUpperCase();
}

function getErrorMessage(error: unknown, fallback: string): string {
  const responseError = (error as {
    response?: { data?: { error?: { message?: string } | string } };
  })?.response?.data?.error;

  if (typeof responseError === 'string') {
    return responseError;
  }

  if (responseError && typeof responseError === 'object' && responseError.message) {
    return responseError.message;
  }

  return fallback;
}

export default function SettingsScreen(): React.ReactElement {
  const authUser = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const profile = useUserStore((state) => state.profile);
  const loadUserProfile = useUserStore((state) => state.loadUserProfile);

  const displayName = profile?.displayName ?? authUser?.displayName ?? 'Kullanıcı';
  const email = profile?.email ?? authUser?.email ?? '';

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!profile) {
      loadUserProfile().catch(() => undefined);
    }
  }, [profile, loadUserProfile]);

  const handleLogout = useCallback(async () => {
    await axiosInstance.post('/auth/logout').catch(() => undefined);
    await clearAuth();
  }, [clearAuth]);

  const handleDeleteAccount = useCallback(async () => {
    const normalized = confirmationText.trim().toLocaleUpperCase('tr-TR');
    if (normalized !== DELETE_CONFIRMATION) {
      Alert.alert('Hata', `"${DELETE_CONFIRMATION}" yazmanız gerekmektedir.`);
      return;
    }

    setIsDeleting(true);

    try {
      await axiosInstance.delete('/account', {
        data: { confirmation: confirmationText.trim() },
      });

      setDeleteModalVisible(false);
      await clearAuth();

      Alert.alert(
        'Hesap Silme Talebi Alındı',
        'Hesabınız hemen devre dışı bırakıldı. Kişisel bilgileriniz anonimleştirildi ve kalıcı silme işlemi 30 günlük saklama penceresinden sonra tamamlanacak.',
        [{ text: 'Tamam' }]
      );
    } catch (err: unknown) {
      Alert.alert('Hata', getErrorMessage(err, 'Hesap silme işlemi başarısız.'));
    } finally {
      setIsDeleting(false);
    }
  }, [clearAuth, confirmationText]);

  const isConfirmValid =
    confirmationText.trim().toLocaleUpperCase('tr-TR') === DELETE_CONFIRMATION;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitial(displayName)}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{displayName}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
        </View>
      </View>

      <View style={styles.legalSection}>
        <Text style={styles.legalText}>
          Gerçek para içermez. Tüm işlemler Sanal Para (VC) ile gerçekleşir.
        </Text>
        <Text style={styles.legalText}>
          Türkiye'deki kullanıcılar: Kişisel verileriniz 6698 Sayılı KVKK kapsamında işlenmektedir.
        </Text>
        <Text style={styles.legalText}>
          17 yaş ve üzeri kullanıcılara yöneliktir.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL('https://finrouteapp.com/privacy')}
          accessibilityRole="link"
        >
          <Text style={styles.privacyLink}>Gizlilik Politikası</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          setConfirmationText('');
          setDeleteModalVisible(true);
        }}
      >
        <Text style={styles.deleteButtonText}>Hesabımı Sil</Text>
      </TouchableOpacity>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeleting && setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Hesabı Kalıcı Olarak Sil</Text>
            <Text style={styles.modalBody}>
              Bu işlem hesabınıza erişimi hemen kapatır.{'\n\n'}
              Kişisel bilgileriniz <Text style={styles.emphasis}>anonimleştirilir</Text> ve hesabınız 30 gün sonra kalıcı olarak silinir.
              {'\n\n'}
              Onaylamak için aşağıya <Text style={styles.confirmKeyword}>{DELETE_CONFIRMATION}</Text> yazın.
            </Text>
            <TextInput
              style={styles.confirmInput}
              value={confirmationText}
              onChangeText={setConfirmationText}
              placeholder={DELETE_CONFIRMATION}
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeleting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  (!isConfirmValid || isDeleting) && styles.confirmBtnDisabled,
                ]}
                onPress={handleDeleteAccount}
                disabled={!isConfirmValid || isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Hesabı Sil</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 24, paddingBottom: 48 },
  profileSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1 },
  displayName: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
  email: { color: '#64748B', fontSize: 14, marginTop: 2 },
  legalSection: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  legalText: { color: '#475569', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  privacyLink: {
    color: '#6366F1',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  logoutText: { color: '#0F172A', fontSize: 15, fontWeight: '600' },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { color: '#0F172A', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalBody: { color: '#475569', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  emphasis: { fontWeight: '600', color: '#0F172A' },
  confirmKeyword: { color: '#DC2626', fontWeight: '700' },
  confirmInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 20,
    backgroundColor: '#F8FAFC',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#475569', fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#FCA5A5' },
  confirmBtnText: { color: '#FFF', fontWeight: '700' },
});
