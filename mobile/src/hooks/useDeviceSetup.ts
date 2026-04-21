import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';
import { updateTimezone } from '../api/userService';

export const useDeviceSetup = () => {
  const { isLoggedIn, userId } = useAuthStore();
  const { profile, loadUserProfile } = useUserStore();

  useEffect(() => {
    // Sadece kullanıcı giriş yapmışsa çalıştır
    if (!isLoggedIn || !userId) return;

    const setupDevice = async () => {
      try {
        // 1. Profil bilgisini store'dan al veya yoksa çek
        if (!profile) {
          await loadUserProfile();
        }

        // JS getTimezoneOffset() UTC'ye göre ofseti ters (- işaretiyle) verir.
        // Bu yüzden *-1 ile backend'in beklediği gerçek ofsete çeviriyoruz.
        // Örneğin: Türkiye UTC+3 için getTimezoneOffset() -180 döner. -180 * -1 = +180.
        const localOffset = new Date().getTimezoneOffset() * -1;

        // 2. Eğer backend'deki ayar ile lokal cihaz saati uyuşmuyorsa, backend'i güncelle
        if (profile && profile.timezoneOffsetMinutes !== localOffset) {
          await updateTimezone(localOffset);
          // Store'u lokal olarak güncelle ki tekrar tekrar istek atmasın
          useUserStore.getState().updateLocally({ timezoneOffsetMinutes: localOffset });
        }

      } catch (error) {
        console.warn('Cihaz kurulum (Device Setup) hatası:', error);
      }
    };

    setupDevice();
  }, [isLoggedIn, userId, profile?.timezoneOffsetMinutes]);
};
