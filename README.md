# FinRoute MVP

FinRoute MVP, kullanıcıların portföylerini yönetebildiği, canlı piyasa verilerini takip edip güvenli bir şekilde alım-satım işlemleri (trade) yapabildiği yüksek performanslı bir mobil finans uygulamasıdır. 
Bu proje, yüksek işlem güvenliği, eşzamanlılık (concurrency) yönetimi ve performans optimizasyonları göz önünde bulundurularak özel **"Altın Kurallar" (Golden Rules)** mimarisine göre inşa edilmiştir.

## 🚀 Teknolojiler ve Mimari Çatı

- **Mobil (Frontend):** React Native (Expo), TypeScript
- **State Yönetimi:** Zustand (Granüler render ve select tabanlı mimari)
- **Ağ İstekleri:** Axios (Kuyruk yapılı otomatik Token Refresh), WebSockets
- **Backend:** Node.js, Express.js
- **Veritabanı:** PostgreSQL (Sıralı migration yönetimi)
- **Arka Plan İşlemleri:** BullMQ (Trade process için)

---

## 🏗️ Altın Kurallar ve Temel Mühendislik Çözümleri

Proje içerisinde hata payını sıfıra indirmek ve veri tutarlılığını sağlamak için aşağıda belirtilen katı kural setleri (Örn: A-01, Z-3 vb.) kod tabanına entegre edilmiştir:

### 1. İşlem Güvenliği ve Idempotency (A-02, Z-3)
Kullanıcıların zayıf internet bağlantılarında veya arayüzde üst üste tıklamalarında "çifte işlem" (duplicate trade) yapılmasını engellemek için katı bir **Idempotency** altyapısı kurulmuştur.
- Her işlem oturumu başlarken eşsiz bir `uuid` üretilir (`beginTradeSession`).
- API isteklerinde bu eşsiz değer `Idempotency-Key` header'ı olarak backend'e gönderilir. Backend, in-progress durumları kontrol ederek işlemi bloklar.
- Ön yüzde işlemler ne şekilde sonuçlanırsa sonuçlansın `try-finally` bloğu ile oturumlar temizlenir (`endTradeSession`).

### 2. Optimistic Locking ve Auto-Retry (P-01, A-01)
Aynı portföy veya varlık üzerinde eşzamanlı işlem (concurrent access) yapılmaya çalışıldığında bakiye tutarsızlığını önlemek için veritabanında versiyon tabanlı **Optimistic Locking** kullanılır.
- Frontend tarafında bir işlem 409 Conflict (Çakışma) hatası alırsa, sistem arka planda işlemi kullanıcıdan habersiz, bekleme süresini artırarak otomatik olarak dener. Maksimum denemeden sonra hala hata varsa kontrol kullanıcıya bırakılır.

### 3. Hassas Finansal Veri Yönetimi (A-03, W4-R4)
Finansal uygulamalardaki kayan nokta (floating point) tabanlı hataların önüne geçmek için miktar (`quantity`) ve bakiye (`cash_balance`) gibi değerler, hesaplama anı haricinde string tipinde yönetilir. Backend ile API iletişimi daima **String** olarak sağlanır.

### 4. Akıllı Güvenlik ve Token Yönetimi (D4-1-B, D4-1-D)
- `accessToken` güvenlik gereği asla kalıcı belleğe (AsyncStorage) yazılmaz; bellekten uçtuğunda uygulamanın token'ı yenilemeye zorlanması `best-practice` olarak benimsenmiştir.
- Sadece `refreshToken` güvenli bir şekilde saklanır.
- Token geçerliliğini yitirdiğinde (HTTP 401), paralel olarak atılan çoklu API istekleri bir Failed Queue (Başarısız Kuyruğu) içerisine alınır ve token refresh işlemi bittikten sonra tüm istekler aynı anda tekrar işlenir.

### 5. Performanslı UI ve WebSocket Hayat Döngüsü (Z-1, Z-2)
- **WebSocket Lifecycle:** Arka planda pil tüketimini ve gereksiz ağ trafiğini engellemek için, uygulama AppState değişimini dinler. Cihaz uykuya veya arka plana geçtiğinde WS duraklatılır (Pause/Resume).
- **Zustand Granular Updates:** Liste ekranlarında (`FlatList`), ana sayfanın tamamı değil; Zustand selektörleri aracılığıyla sadece fiyatı değişen ilgili hisse bileşeni (`HoldingTile`) tekil olarak yeniden render edilir.

---

## 📂 Proje Dizin Yapısı

```text
FinRoute_MVP/
├── backend/
│   ├── src/
│   │   ├── middleware/idempotency.ts  # Çifte işlem engelleyici
│   │   └── config/database.ts         # PostgreSQL Pool 
│   ├── scripts/run-migrations.ts      # Transaction tabanlı DB migration mekanizması
│   └── migrations/                    # SQL Dosyaları
│
├── mobile/
│   ├── src/
│   │   ├── api/axiosInstance.ts       # Axios Interceptor ve Kuyruk mekanizması
│   │   ├── components/                # TradeBottomSheet, WsStatusBadge, vs.
│   │   ├── screens/PortfolioScreen.tsx# Portföy ekranı ve listeleme
│   │   ├── store/                     # Zustand (authStore, tradeStore, priceStore)
│   │   ├── utils/idempotency.ts       # Trade session UUID yönetimi
│   │   └── types/index.ts             # Tüm TS Interface'leri ve tipler
│   └── ...
```

---

## ⚙️ Kurulum ve Çalıştırma

### Backend (Sunucu)
1. `/backend` dizinine gidin.
2. Bağımlılıkları yükleyin: `npm install`
3. `.env` dosyanızı PostgreSQL bağlantı bilgilerinizle ayarlayın.
4. Veritabanı tablolarını ayağa kaldırmak için: `npm run migrate`
5. Sunucuyu başlatın: `npm run dev`

### Mobile (İstemci)
1. `/mobile` dizinine gidin.
2. Bağımlılıkları yükleyin: `npm install`
3. Kök dizindeki `.env` içerisindeki `EXPO_PUBLIC_API_URL` değişkenini bulunduğunuz ağın statik IP'sine göre (Örn: `http://192.168.1.10:3000/api/v1`) güncelleyin.
4. Expo'yu çalıştırın: `npx expo start`

---

> **Not:** Bu repo, MVP gereksinimlerine ve ölçeklenebilirlik kurallarına göre oluşturulmuştur.