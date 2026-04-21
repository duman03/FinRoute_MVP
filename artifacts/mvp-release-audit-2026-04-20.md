# FinRoute MVP + Release Audit

Tarih: 2026-04-20

## Bu turda kapatilan kritik blokajlar

- Mobile TypeScript yapılandırması Expo ile uyumlu hale getirildi.
- Auth bootstrap akışı, `/auth/refresh` yanıtının gerçek sözleşmesine göre düzeltildi.
- `authStore` logout ve refresh davranışı güvenilir hale getirildi.
- Mobile websocket akışı, gerçek `ws/prices` + token + subscribe mantığına bağlandı.
- Portföy ekranı backend cevaplarını doğru okuyacak şekilde yeniden hizalandı.
- Portföyü olmayan kullanıcı için ilk portföy oluşturma akışı eklendi.
- Trade bottom sheet, gerçek `/portfolios/:id/transactions` sözleşmesine bağlandı.
- Trade doğrulama şeması, header tabanlı idempotency yapısıyla çelişmeyecek hale getirildi.
- Ayarlar ekranındaki hesap silme onayı backend ile birebir uyumlu hale getirildi.
- Logout akışına backend session temizliği eklendi.
- Push notification kaydı sadece login sonrası çalışacak şekilde düzeltildi.
- Hesap silme akışı, store uyumluluğu için gerçek silme modeline yaklaştırıldı.
- `transactions` ilişkileri için hard-delete uyumlu migration eklendi.
- `privacy` ve `delete-account` web sayfaları repo içine eklendi ve Nginx'e bağlandı.
- Eksik mobil ikon dosyaları üretildi.
- `backend` ve `mobile` için `typecheck`, `backend` için `migrate` ve `smoke:week8` scriptleri eklendi.

## Kanitlanan durum

- `backend`: `npm run build` basarili
- `backend`: `npm test` basarili
- `mobile`: `npm run typecheck` basarili

## Hala sahada dogrulanmasi gerekenler

- Gercek PostgreSQL + Redis ile migration calistirma
- Register -> portfolio create -> trade -> transaction completion zincirinin manuel smoke testi
- Websocket replay ve foreground/background davranisinin cihaz uzerinde testi
- Push token kaydinin Expo cihazinda testi
- Docker compose port ve environment standardizasyonu
- `google-services.json` veya gerçek push bildirim üretim konfigürasyonu
- Apple / Google store hesap metadata, ekran görüntüleri, yaş derecelendirmesi ve yayın form alanları

## Sonraki MVP adimlari

1. Docker veya lokal servislerle veritabani/redis'i ayağa kaldır.
2. `backend` içinde `npm run migrate` çalıştır.
3. `backend` ve `mobile` uygulamalarını gerçek ortamda birlikte aç.
4. Aşağıdaki akışları uçtan uca doğrula:
   - kayıt ol
   - giriş yap
   - ilk portföyü oluştur
   - alış emri ver
   - satış emri ver
   - günlük check-in
   - leaderboard ve mission ekranlarını aç
   - logout ve hesap silme akışını dene

## Release adimlari

1. Production `.env` değerlerini netleştir.
2. Docker/Nginx portlarını tek standarda indir.
3. Expo production build profillerini doğrula.
4. App Store / Play Store metinleri, KVKK ve privacy linklerini finalle.
5. CI'da en az `backend npm test` ve `mobile npm run typecheck` koş.
