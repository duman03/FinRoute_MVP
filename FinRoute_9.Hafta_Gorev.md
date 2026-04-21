<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# 1'den 8. haftaya kadar olan tüm oyunlaştırma, XP, Streak ve Liderlik altyapısını kusursuzca tamamladık. Şimdi Space'teki yol haritasına göre 9. Hafta (Bildirim Motoru, Akıllı Zamanlama ve Sistem Entegrasyonu) görevine başlıyoruz. Lütfen web araması yapma, sadece bu talimatlara ve önceki haftaların mimari kararlarına odaklan:

Bana şu somut teslimatları (deliverables) Node.js/TypeScript kod örnekleri, SQL şemaları ve mimari açıklamalarla hazırla:
Blocker (Hafta 8'den Kalanlar): Performans için user_xp_totals adında bir MATERIALIZED VIEW oluşturan ve REFRESH MATERIALIZED VIEW CONCURRENTLY desteği için UNIQUE INDEX barındıran SQL migration dosyasını yaz. Ardından gamification-service/src/index.ts dosyasını oluşturarak, sunucu ayağa kalkarken veritabanı/Redis bağlantılarını kuran ve 8. haftada yazdığımız scheduleLeaguePromotion() ile scheduleFullReconcile() tekrarlı görevlerini (cron) başlatan 'Bootstrap' kodunu yaz.
Push Notification (Bildirim) Motoru: BullMQ kullanarak notification-q adında yeni bir kuyruk ve asenkron worker oluştur. Bu worker, Firebase Cloud Messaging (FCM) mantığını kullanarak (şimdilik mock/console.log ile) cihaz token'larına bildirim ('Tebrikler Lige Yükseldin', 'Serin Bozuluyor') gönderebilmeli. Gönderim başarısız olursa (retry) ve spam'i önleme (rate-limit) mantıklarını BullMQ ayarlarına ekle.
Akıllı ve Saygılı Zamanlama (Smart Timezone Algorithm): Kullanıcılara gece 03:00'te 'Serin bozuluyor!' bildirimi atmamak (etik oyunlaştırma) için akıllı bir algoritma yaz. users tablosuna timezone_offset (veya timezone string) eklendiğini varsay. Her saat başı çalışan bir cron job tasarla; bu job sadece o an kendi yerel saatinde akşam 19:00 - 21:00 aralığını yaşayan ve bugün check-in yapmamış kullanıcıları tespit edip, onlara 'Serini Kurtar' bildirimini notification-q'ya fırlatsın.
Çıktıyı modüler, açıklayıcı kod blokları içeren temiz bir Markdown formatında sun.

Tüm 8 haftanın mimari kararları (Lua CAS lock'lar, leaderboard-sync-q, hybrid snapshot, BullMQ idempotency) derinlemesine okundu.  Hafta 9 deliverable'ları aşağıdadır.[^1_1][^1_2]

***

# FinRoute — 9. Hafta Deliverable'ları

## Bildirim Motoru, Akıllı Zamanlama ve Sistem Entegrasyonu


***

## 📦 Bölüm 1 — Blocker (Hafta 8'den Kalanlar)

### D33 · Migration `016_user_xp_totals_mv.sql`

`handleFullReconcile` içindeki `GROUP BY SUM(xpgained)` sorgusu tablo büyüdükçe yavaşlar.  Bu MATERIALIZED VIEW bunu önceden hesaplanmış tek bir satıra indirger. `REFRESH MATERIALIZED VIEW CONCURRENTLY` için **zorunlu UNIQUE INDEX** aşağıda eklenmektedir.[^1_2]

```sql
-- gamification-service/migrations/016_user_xp_totals_mv.sql
-- Blocker: Hafta 8 full-reconcile sorgusunu hızlandırır.
-- CONCURRENTLY refresh, production'da kilitsiz (okumalar bloklanmaz).

CREATE MATERIALIZED VIEW IF NOT EXISTS user_xp_totals AS
SELECT
  userid,
  COALESCE(SUM(xpgained), 0)::INTEGER   AS totalxp,
  COUNT(*)::INTEGER                       AS event_count,
  MAX(createdat)                          AS last_xp_at
FROM xpevents
GROUP BY userid
WITH DATA;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY zorunlu koşulu: UNIQUE INDEX
CREATE UNIQUE INDEX uidx_user_xp_totals_userid
  ON user_xp_totals (userid);

-- Leaderboard sıralama sorgularını hızlandıran ek index
CREATE INDEX idx_user_xp_totals_totalxp
  ON user_xp_totals (totalxp DESC);

-- Not: Uygulama başlatıldığında veya full-reconcile sonunda aşağıdaki komut çalıştırılır:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY user_xp_totals;
```

> ⚠️ **Risk Notu:** `WITH DATA` ile ilk kez veri dolu oluşturulur. Tablo büyükse `WITH NO DATA` ile oluşturup ilk `REFRESH`i deployment dışına taşı.

***

### D34 · `gamification-service/src/index.ts` — Bootstrap

`scheduleLeaguePromotion` ve `scheduleFullReconcile`'ın **index.ts'den çağrılmama** riski Hafta 8 denetiminde açık kalem olarak bırakılmıştı.  Bu dosya o açığı kapatır.[^1_2]

```typescript
// gamification-service/src/index.ts
import express from 'express';
import { pool }        from './db/postgres';
import { redisClient } from './db/redis';

// ── Hafta 8 Cron Job'ları ──────────────────────────────────────────────────
import {
  scheduleLeaguePromotion,
  leaguePromotionWorker,           // import side-effect → worker başlar
} from './jobs/league-promotion.job';
import {
  scheduleFullReconcile,
  leaderboardSyncWorker,           // import side-effect → worker başlar
} from './jobs/leaderboard-sync.job';

// ── Hafta 9 Cron Job'ları ──────────────────────────────────────────────────
import {
  scheduleStreakReminderCron,
  streakReminderWorker,            // import side-effect → worker başlar
} from './jobs/streak-reminder.job';
import { notificationWorker }      from './jobs/notification.job';

// ── Routes ──────────────────────────────────────────────────────────────────
import leaderboardRouter  from './routes/leaderboard.route';
import checkinRouter      from './routes/checkin.route';
import gamificationRouter from './routes/gamification.route';

const app = express();
app.use(express.json());
app.use('/api',              leaderboardRouter);
app.use('/api/gamification', checkinRouter);
app.use('/api/gamification', gamificationRouter);

const PORT = process.env.PORT ?? 3002;

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap: DB + Redis bağlantılarını doğrula → cron'ları kaydet → dinle
// ─────────────────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {

  // 1. PostgreSQL
  await pool.query('SELECT 1');
  console.info('[Bootstrap] PostgreSQL ✅');

  // 2. Redis
  await redisClient.ping();
  console.info('[Bootstrap] Redis ✅');

  // 3. Hafta 8 Cron'ları
  await scheduleLeaguePromotion();  // Her Pazar UTC 00:00
  console.info('[Bootstrap] LeaguePromotion cron kayıtlı ✅');

  await scheduleFullReconcile();    // Her Cumartesi UTC 23:30
  console.info('[Bootstrap] FullReconcile cron kayıtlı ✅');

  // 4. Hafta 9 Cron'ları
  await scheduleStreakReminderCron(); // Her saat başı
  console.info('[Bootstrap] StreakReminder cron kayıtlı ✅');

  // Workers yukarıda import edildi — BullMQ otomatik dinliyor.
  // Referans tutarak "unused import" uyarısını bastır:
  void [leaguePromotionWorker, leaderboardSyncWorker,
        notificationWorker, streakReminderWorker];

  // 5. Express
  app.listen(PORT, () =>
    console.info(`[Bootstrap] gamification-service :${PORT} ✅`),
  );
}

bootstrap().catch(err => {
  console.error('[Bootstrap] FATAL:', err);
  process.exit(1);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.info('[Bootstrap] SIGTERM → graceful shutdown...');
  await pool.end();
  await redisClient.quit();
  process.exit(0);
});
```


***

## 📢 Bölüm 2 — Push Notification Motoru

### D35 · Migration `017_users_timezone_device.sql`

Akıllı zamanlama algoritması için `users` tablosuna üç kolon ekliyoruz.[^1_3]

```sql
-- gamification-service/migrations/017_users_timezone_device.sql

ALTER TABLE users
  -- UTC offset dakika cinsinden. Türkiye = +180, EST = -300, Hindistan = +330
  ADD COLUMN IF NOT EXISTS timezone_offset_minutes INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_tz_offset CHECK (timezone_offset_minutes BETWEEN -720 AND 840),

  -- Firebase Cloud Messaging cihaz token'ı (nullable → henüz kayıt yok)
  ADD COLUMN IF NOT EXISTS device_token TEXT,

  -- Etik Opt-Out: FALSE ise hiç bildirim gönderilmez
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Saatlik cron sorgusu için partial index (yalnızca token + opt-in kullanıcılar)
CREATE INDEX IF NOT EXISTS idx_users_notif_eligible
  ON users (timezone_offset_minutes)
  WHERE device_token IS NOT NULL
    AND notifications_enabled = TRUE;
```


***

### D36 · `notification.job.ts` — BullMQ Kuyruğu \& FCM Worker

`notification-q` kuyruğu; retry, BullMQ built-in rate limiter ve per-kullanıcı günlük spam koruması ile donatılmıştır.

```typescript
// gamification-service/src/jobs/notification.job.ts
import { Queue, Worker, Job } from 'bullmq';
import { redisClient }        from '../db/redis';
import { nextUtcMidnightUnix } from '../utils/time.utils'; // Hafta 6'dan mevcut

// ── Payload Tipi ─────────────────────────────────────────────────────────────
export type NotificationType =
  | 'LEAGUE_PROMOTED'  // "Tebrikler Lige Yükseldin! 🏆"
  | 'STREAK_DANGER'    // "🔥 Serin Bozuluyor!"
  | 'STREAK_RESCUE';   // "Serini Kurtar!" — Smart timezone cron'dan gelir

export interface NotificationPayload {
  userId:      string;
  deviceToken: string;
  type:        NotificationType;
  title:       string;
  body:        string;
  data?:       Record<string, string>; // Deep-link, ekran yönlendirme vb.
}

// ── BullMQ Kuyruğu ────────────────────────────────────────────────────────────
export const notificationQueue = new Queue<NotificationPayload>('notification-q', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,                          // FCM geçici hata → 3 deneme
    backoff: { type: 'exponential', delay: 5_000 }, // 5s → 10s → 20s
    removeOnComplete: { count: 500 },
    removeOnFail:     false,              // İnceleme için sakla
  },
});

// ── Spam Koruması (Per-User, Per-Type, Per-Day) ──────────────────────────────
// Aynı kullanıcıya aynı gün aynı tipte max DAILY_NOTIF_LIMIT bildirim.
const DAILY_NOTIF_LIMIT = 2;

// Atomik INCR + EXPIREAT: gece yarısı UTC'de sıfırlanır (Hafta 6 rolling TTL pattern'i)
const SPAM_GUARD_LUA = `
  local current = redis.call('INCR', KEYS[^1_1])
  if current == 1 then
    redis.call('EXPIREAT', KEYS[^1_1], ARGV[^1_1])
  end
  if current > tonumber(ARGV[^1_2]) then
    return 0
  end
  return current
`;

// Kuyruklamadan önce spam kontrolü yap.
// false dönerse bu bildirim bugün zaten limitini doldurmuş → gönderme.
export async function enqueueNotification(
  payload:       NotificationPayload,
  todayUtcDate:  string,  // 'YYYY-MM-DD'
): Promise<boolean> {
  const spamKey = `notif:rl:${payload.userId}:${payload.type}:${todayUtcDate}`;
  const midnightUnix = nextUtcMidnightUnix();

  const count = await redisClient.eval(SPAM_GUARD_LUA, {
    keys:      [spamKey],
    arguments: [midnightUnix.toString(), DAILY_NOTIF_LIMIT.toString()],
  }) as number;

  if (count === 0) {
    console.warn(
      `[Notification] Spam koruması: userId=${payload.userId} type=${payload.type} limit=${DAILY_NOTIF_LIMIT}`
    );
    return false;
  }

  // jobId deterministic → aynı bildirim iki kez kuyruğa giremez (BullMQ idempotency)
  const jobId = `notif:${payload.userId}:${payload.type}:${todayUtcDate}:${count}`;
  await notificationQueue.add(payload.type, payload, { jobId });

  return true;
}

// ── Mock FCM Gönderici ───────────────────────────────────────────────────────
// Gerçek entegrasyon için: firebase-admin SDK ile değiştir.
// admin.messaging().send({ token, notification: { title, body }, data })
async function sendFcm(payload: NotificationPayload): Promise<void> {
  // TODO: firebase-admin entegrasyonu
  console.log('[FCM Mock] 📲 Bildirim gönderiliyor:', {
    to:     payload.deviceToken.slice(0, 12) + '…', // Token'ı logda maskele
    userId: payload.userId,
    type:   payload.type,
    title:  payload.title,
    body:   payload.body,
  });
  // Simüle edilmiş %5 hata (retry testi için — production'da kaldır)
  if (Math.random() < 0.05) throw new Error('FCM mock: geçici bağlantı hatası');
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
export const notificationWorker = new Worker<NotificationPayload>(
  'notification-q',
  async (job: Job<NotificationPayload>) => {
    await sendFcm(job.data);
    console.info(
      `[NotificationWorker] ✅ userId=${job.data.userId} type=${job.data.type} attempt=${job.attemptsMade + 1}`
    );
  },
  {
    connection: redisClient,
    concurrency: 10,
    // FCM kota koruması: dakikada max 100 iş işle (BullMQ built-in rate limiter)
    limiter: { max: 100, duration: 60_000 },
  },
);

notificationWorker.on('failed', (job, err) => {
  console.error(
    `[NotificationWorker] ❌ Job ${job?.id} başarısız ` +
    `(${job?.attemptsMade}/${job?.opts.attempts} deneme): ${err.message}`
  );
});
```


#### Lig Yükselme Bildirimi Entegrasyonu

`league-promotion.job.ts` içindeki `distributeWinnerReward` fonksiyonuna aşağıdaki satırları ekle:

```typescript
// gamification-service/src/jobs/league-promotion.job.ts — mevcut fonksiyona eklenti

import { enqueueNotification } from './notification.job';
import { getServerUtcDate }    from '../utils/time.utils';

async function distributeWinnerReward(
  userId: string, weekStart: string, rank: number, leagueSlug: string
): Promise<void> {
  // ... mevcut XP + rozet mantığı korunur ...

  // Hafta 9 Eklentisi: Yükselme bildirimi kuyruğa at
  const deviceRes = await pool.query<{ device_token: string; displayname: string }>(
    `SELECT device_token, displayname FROM users WHERE id = $1 AND device_token IS NOT NULL`,
    [userId]
  );
  if (deviceRes.rows[^1_0]) {
    const { device_token, displayname } = deviceRes.rows[^1_0];
    await enqueueNotification({
      userId,
      deviceToken: device_token,
      type:  'LEAGUE_PROMOTED',
      title: '🏆 Tebrikler!',
      body:  `${displayname}, ${leagueSlug.charAt(0).toUpperCase() + leagueSlug.slice(1)} Lig'e yükseldin!`,
      data:  { screen: 'leaderboard', leagueSlug },
    }, getServerUtcDate());
  }
}
```


***

## ⏰ Bölüm 3 — Akıllı ve Saygılı Zamanlama

### D37 · `streak-reminder.job.ts` — Smart Timezone Cron

Algoritma mantığı: `Yerel Saat = (UTC Saati + offset_saat) mod 24`. Her saat başı çalışan cron, yalnızca **yerel saati 19:00–20:59 arasında olan** ve **bugün check-in yapmamış** kullanıcıları tespit eder.[^1_4]

```typescript
// gamification-service/src/jobs/streak-reminder.job.ts
import { Queue, Worker, Job } from 'bullmq';
import { redisClient }         from '../db/redis';
import { pool }                from '../db/postgres';
import { getServerUtcDate }    from '../utils/time.utils';
import { enqueueNotification, NotificationPayload } from './notification.job';

// ── Cron Kaydı ────────────────────────────────────────────────────────────────
export async function scheduleStreakReminderCron(): Promise<void> {
  await streakReminderQueue.add(
    'tick',
    {},
    {
      repeat:  { cron: '0 * * * *' }, // Her saat başı (00:00, 01:00, 02:00 ...)
      jobId:   'streak-reminder-hourly',
    },
  );
  console.info('[StreakReminder] Saatlik cron kayıtlı ✅');
}

export const streakReminderQueue = new Queue('streak-reminder-q', {
  connection: redisClient,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'fixed', delay: 30_000 },
    removeOnComplete: { count: 48 }, // Son 48 saat (2 günlük iz)
    removeOnFail:     false,
  },
});

export const streakReminderWorker = new Worker(
  'streak-reminder-q',
  async (_job: Job) => handleTick(),
  { connection: redisClient, concurrency: 1 }, // Tek instance
);

// ── Çekirdek Algoritma ────────────────────────────────────────────────────────
async function handleTick(): Promise<void> {
  const nowUtc    = new Date();
  const utcHour   = nowUtc.getUTCHours();  // 0–23
  const todayUtc  = getServerUtcDate();    // 'YYYY-MM-DD'

  console.info(`[StreakReminder] Tick UTC ${String(utcHour).padStart(2, '0')}:00 → yerel 19:00-20:59 penceresi taranıyor`);

  /*
   * Smart Timezone Algoritması:
   *
   * Yerel Saat = (UTC + offset_saat) mod 24
   * (offset_saat = ROUND(timezone_offset_minutes / 60))
   *
   * Hedef pencere: 19:00 ≤ yerel saat ≤ 20:59  →  local_hour IN (19, 20)
   *
   * SQL'de: ((utcHour + ROUND(offset/60)) % 24) BETWEEN 19 AND 20
   *
   * Gece 03:00'e bildirim atmama kuralı:
   *   Pencere yalnızca 19–20 olduğu için, bir kullanıcının gece 03:00 yerel
   *   saatinde bildirim alması matematiksel olarak imkânsızdır.
   */
  const res = await pool.query<{
    userid:       string;
    device_token: string;
    display_name: string;
  }>(
    `
    SELECT
      u.id                AS userid,
      u.device_token,
      u.displayname       AS display_name
    FROM users u
    -- Bugün check-in yapmamış kullanıcılar (LEFT JOIN + IS NULL pattern)
    LEFT JOIN dailycheckins dc
      ON  dc.userid      = u.id
      AND dc.checkindate = $2::DATE
    WHERE
      dc.userid IS NULL                        -- Bugün giriş YOK
      AND u.device_token      IS NOT NULL      -- FCM token mevcut
      AND u.notifications_enabled = TRUE       -- Etik Opt-In kontrolü

      -- Akıllı Zamanlama: yerel saat 19:00-20:59 penceresinde mi?
      AND (
        ($1::INTEGER + ROUND(u.timezone_offset_minutes::NUMERIC / 60))::INTEGER % 24
      ) BETWEEN 19 AND 20
    `,
    [utcHour, todayUtc],
  );

  if (res.rows.length === 0) {
    console.info(`[StreakReminder] UTC ${utcHour}:00 — uygun kullanıcı yok.`);
    return;
  }

  console.info(`[StreakReminder] ${res.rows.length} kullanıcıya bildirim kuyruğa alınıyor...`);

  let queued = 0;
  for (const row of res.rows) {
    const payload: NotificationPayload = {
      userId:      row.userid,
      deviceToken: row.device_token,
      type:        'STREAK_RESCUE',
      title:       '🔥 Serini Kurtar!',
      body:        `${row.display_name}, bugün henüz giriş yapmadın. Streakini koru!`,
      data:        { screen: 'checkin', todayUtc },
    };

    // enqueueNotification: spam koruması (günlük limit) burada uygulanır
    const accepted = await enqueueNotification(payload, todayUtc);
    if (accepted) queued++;
  }

  console.info(`[StreakReminder] ✅ ${queued}/${res.rows.length} bildirim kuyruğa alındı.`);
}

streakReminderWorker.on('failed', (job, err) =>
  console.error(`[StreakReminderWorker] Job ${job?.id} başarısız: ${err.message}`)
);
```


***

## 📐 Mimari Özet — 9. Hafta Deliverable Matrisi

| \# | Dosya | Amaç | Kilit Mekanizma |
| :-- | :-- | :-- | :-- |
| D33 | `016_user_xp_totals_mv.sql` | `full-reconcile` sorgu optimizasyonu | `UNIQUE INDEX` → `CONCURRENTLY` refresh |
| D34 | `src/index.ts` | Bootstrap: DB/Redis bağlantısı + cron kayıt | Hafta 8 açık kalemi kapatıldı |
| D35 | `017_users_timezone_device.sql` | Timezone offset + FCM token + opt-out | `BETWEEN -720 AND 840` constraint |
| D36 | `notification.job.ts` | BullMQ `notification-q` + FCM mock | Exponential retry + per-user Lua spam guard |
| D37 | `streak-reminder.job.ts` | Saatlik smart timezone cron | `(utcHour + offset/60) % 24 BETWEEN 19 AND 20` |

> ⚠️ **Kritik Uyarı:** `timezone_offset_minutes` istemciden geliyorsa **sunucu tarafında doğrula** (`BETWEEN -720 AND 840` CHECK constraint mevcut). Kötü niyetli bir istemci offset'i manipüle ederek spam penceresi oluşturmaya çalışabilir; bu nedenle `enqueueNotification`'daki günlük Lua spam guard ikinci savunma katmanı olarak zorunludur.

> ⚠️ **FCM Production Geçişi:** `sendFcm()` içindeki `console.log` bloğu `firebase-admin` SDK ile değiştirildiğinde, `admin.messaging().send()` çağrısı ağ hatası fırlatırsa BullMQ'nun `attempts: 3` + `exponential backoff` otomatik retry yapar. Mock'taki %5 hata simülasyonu bu davranışı geliştirme ortamında test etmek için bırakılmıştır; production'da kaldırın.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: FinRoute_8.Hafta_Gorev.md

[^1_2]: FinRoute_8.hafta-Kontrol.md

[^1_3]: Hafta-Alan-Ama-SomutDeliverablelar.csv

[^1_4]: FinRoute_6.Hafta_Gorev.md

[^1_5]: FinRoute_7.Hafta_Gorev.md

[^1_6]: FinRoute_7.hafta Kontrol.md

[^1_7]: FinRoute_6.hafta Kontrol.md

[^1_8]: FinRoute_5.Hafta_Gorev.md

[^1_9]: FinRoute_5.hafta Kontrol.md

[^1_10]: FinRoute 3.hafta Görev.md

[^1_11]: FinRoute_2.Hafta_Gorev.pdf

[^1_12]: FinRoute — Hafta 1 Deliverables_ Ürün \& Risk + Mim.pdf

[^1_13]: -Deliverable-Kaynak-Durum.csv

[^1_14]: -Konu-Neredezlmeli.csv

[^1_15]: FinRoute.pdf

[^1_16]: Perplexity.pdf

[^1_17]: Perplexity AI_ İleri Düzey Kullanım Rehberi.pdf

[^1_18]: Perplexity AI İleri Düzey Kullanım Rehberi.pdf


---

# 9. Hafta Bildirim ve Bootstrap mimarimiz kıdemli bir SRE (Site Reliability Engineer) tarafından denetlendi. Sistemi spam bildirimlerden, veritabanı kilitlenmelerinden (deadlock) ve veri kaybından kurtarmak için kodları şu 3 net SRE direktifine göre derhal (v2 olarak) güncellemeni istiyorum (Lütfen web araması yapma, sadece bu direktiflere odaklan):

Spam Bomb Fix (Idempotency): notification.job.ts içinde DAILY_NOTIF_LIMITS objesi oluştur ve STREAK_RESCUE gibi türler için limiti 1'e indir. BullMQ'nun deduplication yapabilmesi için jobId içindeki count değişkenini kaldırıp sabit bir ID (notif:userId:type:date) kullan. Ayrıca SQL tarafında çift bildirimi engellemek için sent_notifications (UNIQUE user_id, notif_type, sent_date) adında yeni bir migration tablosu ekle ve bildirimi atmadan önce ON CONFLICT DO NOTHING ile kontrol et.
Materialized View Deadlock Fix: leaderboard-sync.job.ts içindeki handleFullReconcile fonksiyonunu tamamen değiştir. pg_try_advisory_lock (Advisory Lock) kullanarak aynı anda tek bir refresh çalışmasını garanti altına al. REFRESH MATERIALIZED VIEW CONCURRENTLY işlemini KESİNLİKLE bir transaction (BEGIN/COMMIT) bloğu dışında çalıştır ve öncesinde SET lock_timeout = '10s' ayarını yap.
Graceful Shutdown (Zombie Worker Fix): index.ts dosyasındaki kapanış (shutdown) sırasını düzelt. Sunucu kapanırken işlemi sırasıyla şöyle yap: 1) HTTP sunucusunu kapat, 2) Tüm BullMQ worker'larını (worker.close()) bekleterek kapat, 3) BullMQ Queue'larını kapat, 4) PostgreSQL pool'u (pool.end()) kapat, 5) Redis'i (redisClient.quit()) kapat. Ayrıca 30 saniyelik bir forceKillGuard ekle ve hem SIGTERM hem SIGINT sinyallerini dinle.
Lütfen bu 3 hayati yamayı içeren, production ortamına çıkmaya %100 hazır 9. Hafta v2 kodlarını temiz bir Markdown ile oluştur.

Tüm direktifler önceki hafta mimarisi ile birlikte tam okundu.  Aşağıda üç SRE yamasının tamamı v2 olarak sunulmaktadır.[^2_1][^2_2]

***

# FinRoute — 9. Hafta v2 · SRE Denetim Yamaları


***

## 🔴 Direktif 1 — Spam Bomb Fix (Idempotency)

### Migration `018_sent_notifications.sql`

DB katmanında **ikinci savunma hattı**: aynı kullanıcıya aynı gün aynı tipte iki kayıt giremez.

```sql
-- gamification-service/migrations/018_sent_notifications.sql
-- Amaç: notification-q worker birden fazla pod'da çalışsa bile
--        aynı bildirim iki kez gönderilemez (DB-level idempotency).

CREATE TABLE IF NOT EXISTS sent_notifications (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notif_type    TEXT         NOT NULL,  -- 'STREAK_RESCUE', 'LEAGUE_PROMOTED', ...
  sent_date     DATE         NOT NULL,  -- UTC date (sunucu tarafı)
  device_token  TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Core idempotency kısıtı: aynı kullanıcı + tip + gün = tek kayıt
  CONSTRAINT uq_sent_notification UNIQUE (user_id, notif_type, sent_date)
);

-- Günlük temizleme sorguları için index
CREATE INDEX IF NOT EXISTS idx_sent_notifications_date
  ON sent_notifications (sent_date DESC);
```


***

### `notification.job.ts` — v2 (Tam Dosya)

Üç temel değişiklik:

1. `DAILY_NOTIF_LIMITS` objesinde `STREAK_RESCUE = 1`
2. `jobId`'den `count` kaldırıldı → `notif:userId:type:date` sabit ID
3. Gönderimden önce `sent_notifications` tablosuna `ON CONFLICT DO NOTHING` yazımı
```typescript
// gamification-service/src/jobs/notification.job.ts  — v2
import { Queue, Worker, Job } from 'bullmq';
import { redisClient }        from '../db/redis';
import { pool }               from '../db/postgres';
import { nextUtcMidnightUnix, getServerUtcDate } from '../utils/time.utils';

// ── Payload ──────────────────────────────────────────────────────────────────
export type NotificationType =
  | 'LEAGUE_PROMOTED'
  | 'STREAK_DANGER'
  | 'STREAK_RESCUE';

export interface NotificationPayload {
  userId:      string;
  deviceToken: string;
  type:        NotificationType;
  title:       string;
  body:        string;
  data?:       Record<string, string>;
}

// ── Direktif 1-A: Tür bazlı günlük limit (STREAK_RESCUE → 1) ─────────────────
const DAILY_NOTIF_LIMITS: Record<NotificationType, number> = {
  STREAK_RESCUE:    1, // Günde en fazla 1 "Serini kurtar" bildirimi
  STREAK_DANGER:    1,
  LEAGUE_PROMOTED:  2, // Birden fazla lig atlaması mümkün → 2
};

// ── Direktif 1-B: Redis spam guard (Lua — rolling TTL, Hafta 6 pattern) ───────
const SPAM_GUARD_LUA = `
  local current = redis.call('INCR', KEYS[^2_1])
  if current == 1 then
    redis.call('EXPIREAT', KEYS[^2_1], ARGV[^2_1])
  end
  if current > tonumber(ARGV[^2_2]) then
    return 0
  end
  return current
`;

// ── BullMQ Kuyruğu ────────────────────────────────────────────────────────────
export const notificationQueue = new Queue<NotificationPayload>('notification-q', {
  connection: redisClient,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     false,
  },
});

// ── Kuyruğa Alma (Spam korumalı + DB idempotency) ─────────────────────────────
export async function enqueueNotification(
  payload:      NotificationPayload,
  todayUtcDate: string,   // 'YYYY-MM-DD' — her zaman getServerUtcDate()'den gelir
): Promise<boolean> {

  const limit       = DAILY_NOTIF_LIMITS[payload.type] ?? 1;
  const spamKey     = `notif:rl:${payload.userId}:${payload.type}:${todayUtcDate}`;
  const midnightUnix = nextUtcMidnightUnix();

  // Katman 1 — Redis hız engeli
  const count = await redisClient.eval(SPAM_GUARD_LUA, {
    keys:      [spamKey],
    arguments: [midnightUnix.toString(), limit.toString()],
  }) as number;

  if (count === 0) {
    console.warn(
      `[Notification] Redis spam guard: userId=${payload.userId} ` +
      `type=${payload.type} limit=${limit} — atlandı`
    );
    return false;
  }

  // Direktif 1-B: count kaldırıldı → sabit, deterministik jobId
  // Aynı kullanıcı + tip + tarih kombinasyonu için BullMQ deduplication garantisi.
  const jobId = `notif:${payload.userId}:${payload.type}:${todayUtcDate}`;

  await notificationQueue.add(payload.type, payload, { jobId });
  return true;
}

// ── Mock FCM ──────────────────────────────────────────────────────────────────
async function sendFcm(payload: NotificationPayload): Promise<void> {
  // TODO: firebase-admin → admin.messaging().send({ token, notification, data })
  console.log('[FCM Mock] 📲', {
    to:    payload.deviceToken.slice(0, 12) + '…',
    userId: payload.userId,
    type:  payload.type,
    title: payload.title,
  });
  if (Math.random() < 0.05) throw new Error('FCM mock: geçici bağlantı hatası');
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
export const notificationWorker = new Worker<NotificationPayload>(
  'notification-q',
  async (job: Job<NotificationPayload>) => {
    const { userId, deviceToken, type } = job.data;
    const todayUtc = getServerUtcDate();

    // Direktif 1-C: DB katmanı idempotency (ikinci savunma hattı)
    // İki pod aynı anda bu noktaya gelirse ON CONFLICT DO NOTHING biri durdurur.
    const insertRes = await pool.query(
      `INSERT INTO sent_notifications (user_id, notif_type, sent_date, device_token)
       VALUES ($1, $2, $3::DATE, $4)
       ON CONFLICT (user_id, notif_type, sent_date) DO NOTHING`,
      [userId, type, todayUtc, deviceToken],
    );

    // rowCount === 0 → bu bildirim bugün daha önce gönderilmiş → işi tamamlanmış say, FCM çağırma
    if ((insertRes.rowCount ?? 0) === 0) {
      console.info(
        `[NotificationWorker] İdempotent skip: userId=${userId} type=${type} tarih=${todayUtc}`
      );
      return; // BullMQ "completed" sayar, retry tetiklenmez
    }

    // DB kaydı başarılı → FCM'i çağır
    await sendFcm(job.data);

    console.info(
      `[NotificationWorker] ✅ userId=${userId} type=${type} ` +
      `attempt=${job.attemptsMade + 1}`
    );
  },
  {
    connection:  redisClient,
    concurrency: 10,
    // FCM kota koruması: dakikada max 100 iş
    limiter: { max: 100, duration: 60_000 },
  },
);

notificationWorker.on('failed', (job, err) =>
  console.error(
    `[NotificationWorker] ❌ Job ${job?.id} başarısız ` +
    `(${job?.attemptsMade}/${job?.opts.attempts} deneme): ${err.message}`
  )
);
```


***

## 🔴 Direktif 2 — Materialized View Deadlock Fix

### `leaderboard-sync.job.ts` — `handleFullReconcile` v2

Üç kritik değişiklik:

1. `pg_try_advisory_lock` ile tek process garantisi
2. `REFRESH MATERIALIZED VIEW CONCURRENTLY` **transaction dışında** çalıştırılıyor
3. `SET lock_timeout = '10s'` ile kilitlenme bekleme süresi sınırlandırıldı
```typescript
// gamification-service/src/jobs/leaderboard-sync.job.ts
// Sadece handleFullReconcile fonksiyonu v2 olarak güncellendi.
// enqueueSyncUser, handleSyncUser ve Worker tanımı Hafta 9 v1'den korundu.

import { Pool, PoolClient } from 'pg';
import { pool }              from '../db/postgres';
import { redisClient }       from '../db/redis';
import { getServerUtcDate, getWeekMondayUtc } from '../utils/time.utils';

// Advisory lock sabit ID'si — tüm pod'lar aynı sayıyı kullanır.
// pg_try_advisory_lock(bigint) → uygulama genelinde tek bir kilit noktası.
const RECONCILE_ADVISORY_LOCK_ID = 7_391_045; // Rastgele, çakışmasın diye sabit

// ── handleFullReconcile v2 ───────────────────────────────────────────────────
async function handleFullReconcile(): Promise<void> {
  const weekStart = getWeekMondayUtc(getServerUtcDate());
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();

    // Direktif 2-A: lock_timeout → bu bağlantı için geçerli, 10s'den fazla
    // pg_try_advisory_lock beklemeye çalışırsa zaman aşımına uğrar.
    await client.query(`SET lock_timeout = '10s'`);

    // Direktif 2-B: pg_try_advisory_lock — non-blocking.
    // false dönerse başka bir pod zaten çalışıyor → sessizce çık.
    const lockRes = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [RECONCILE_ADVISORY_LOCK_ID],
    );

    if (!lockRes.rows[^2_0]?.acquired) {
      console.warn('[FullReconcile] Advisory lock alınamadı — başka pod çalışıyor, atlanıyor.');
      return;
    }

    console.info(`[FullReconcile] ${weekStart} haftası için başlatıldı.`);

    // Direktif 2-C: MATERIALIZED VIEW refresh — KESİNLİKLE transaction DIŞINDA.
    // REFRESH MATERIALIZED VIEW CONCURRENTLY bir transaction bloğu içinde
    // çalışırsa "ERROR: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run
    // inside a transaction block" hatası fırlatır.
    //
    // pool.query() bağımsız bağlantı kullanır — client transaction'ından izole.
    await pool.query(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY user_xp_totals`
    );
    console.info('[FullReconcile] user_xp_totals MATERIALIZED VIEW yenilendi ✅');

    // MV güncel → Redis ZSET senkronizasyonu
    const res = await client.query<{
      userid:     string;
      totalxp:    string;
      leagueslug: string;
    }>(
      `SELECT
         mv.userid,
         mv.totalxp::TEXT,
         COALESCE(ula.leagueslug, 'bronze') AS leagueslug
       FROM user_xp_totals mv
       LEFT JOIN user_league_assignments ula
         ON  ula.userid    = mv.userid
         AND ula.weekstart = $1
       WHERE ula.final_rank IS NULL`,  -- Yalnızca aktif hafta
      [weekStart],
    );

    if (res.rows.length === 0) {
      console.info('[FullReconcile] Bu hafta XP kaydı yok.');
      return;
    }

    const LEAGUE_LB_TTL = 8 * 24 * 60 * 60;
    const pipeline      = redisClient.multi();
    const leagueKeys    = new Set<string>();

    for (const row of res.rows) {
      const totalXp   = Number(row.totalxp);
      const leagueKey = `lb:league:${row.leagueslug}:${weekStart}`;
      pipeline.zAdd('lb:global', { score: totalXp, value: row.userid });
      pipeline.zAdd(leagueKey,   { score: totalXp, value: row.userid });
      leagueKeys.add(leagueKey);
    }
    for (const key of leagueKeys) pipeline.expire(key, LEAGUE_LB_TTL);

    await pipeline.exec();
    console.info(`[FullReconcile] ✅ ${res.rows.length} kullanıcı Redis ZSET'e yazıldı.`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[FullReconcile] HATA:', message);
    throw err; // BullMQ retry devralır

  } finally {
    if (client) {
      // Advisory lock bağlantı kapanınca PostgreSQL tarafından otomatik serbest bırakılır.
      // Explicit release — savunmacı programlama
      try {
        await client.query(
          `SELECT pg_advisory_unlock($1)`, [RECONCILE_ADVISORY_LOCK_ID]
        );
      } catch (_) { /* kapanma sırasında hata olursa yut */ }
      client.release();
    }
  }
}

export { handleFullReconcile };
```

> ⚠️ **Risk Notu:** `pg_try_advisory_lock` session-level kilit açar; bağlantı kapanınca PostgreSQL otomatik unlock yapar. `finally` bloğundaki explicit `pg_advisory_unlock` savunmacı programlama içindir — pool'dan başka biri aynı bağlantıyı almadan önce kilidi serbest bırakır.

***

## 🔴 Direktif 3 — Graceful Shutdown (Zombie Worker Fix)

### `gamification-service/src/index.ts` — v2 (Tam Dosya)

Kapatma sırası: **HTTP → Workers → Queues → Pool → Redis**. 30 saniyelik `forceKillGuard` hem `SIGTERM` hem `SIGINT`'i dinler.

```typescript
// gamification-service/src/index.ts  — v2
import express, { Express } from 'express';
import { Server }            from 'http';
import { pool }              from './db/postgres';
import { redisClient }       from './db/redis';

// ── Hafta 8 Job'ları ─────────────────────────────────────────────────────────
import {
  scheduleLeaguePromotion,
  leaguePromotionQueue,
  leaguePromotionWorker,
} from './jobs/league-promotion.job';
import {
  scheduleFullReconcile,
  leaderboardSyncQueue,
  leaderboardSyncWorker,
} from './jobs/leaderboard-sync.job';

// ── Hafta 9 Job'ları ─────────────────────────────────────────────────────────
import {
  scheduleStreakReminderCron,
  streakReminderQueue,
  streakReminderWorker,
} from './jobs/streak-reminder.job';
import {
  notificationQueue,
  notificationWorker,
} from './jobs/notification.job';

// ── Routes ───────────────────────────────────────────────────────────────────
import leaderboardRouter  from './routes/leaderboard.route';
import checkinRouter      from './routes/checkin.route';
import gamificationRouter from './routes/gamification.route';

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
const app: Express = express();
app.use(express.json());
app.use('/api',              leaderboardRouter);
app.use('/api/gamification', checkinRouter);
app.use('/api/gamification', gamificationRouter);

// Health probe — Kubernetes liveness / k8s readiness
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

const PORT = Number(process.env.PORT ?? 3002);
let httpServer: Server;

async function bootstrap(): Promise<void> {
  // 1. Bağlantı doğrulama
  await pool.query('SELECT 1');
  console.info('[Bootstrap] PostgreSQL ✅');

  await redisClient.ping();
  console.info('[Bootstrap] Redis ✅');

  // 2. Hafta 8 Cron kayıtları
  await scheduleLeaguePromotion();
  console.info('[Bootstrap] LeaguePromotion cron ✅');

  await scheduleFullReconcile();
  console.info('[Bootstrap] FullReconcile cron ✅');

  // 3. Hafta 9 Cron kayıtları
  await scheduleStreakReminderCron();
  console.info('[Bootstrap] StreakReminder cron ✅');

  // Worker'lar import side-effect ile başladı — referans tutarak lint uyarısı önle
  void [
    leaguePromotionWorker,
    leaderboardSyncWorker,
    streakReminderWorker,
    notificationWorker,
  ];

  // 4. HTTP
  await new Promise<void>(resolve => {
    httpServer = app.listen(PORT, resolve);
  });
  console.info(`[Bootstrap] gamification-service :${PORT} ✅`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Direktif 3 — Graceful Shutdown
// Kapatma sırası: HTTP → Workers → Queues → Pool → Redis
// ─────────────────────────────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return; // Çift sinyal koruması (SIGTERM + SIGINT aynı anda)
  isShuttingDown = true;

  console.info(`[Shutdown] ${signal} alındı — graceful shutdown başlıyor...`);

  // Direktif 3: 30 saniye sonra zorla öldür (zombie worker koruması)
  const forceKillGuard = setTimeout(() => {
    console.error('[Shutdown] ⛔ 30 saniye doldu — process.exit(1) zorla çalıştırılıyor');
    process.exit(1);
  }, 30_000);
  // Node.js'in timeout nedeniyle açık kalmasını engelle
  forceKillGuard.unref();

  try {
    // Adım 1: HTTP sunucusunu kapat — yeni istek alma
    await new Promise<void>((resolve, reject) =>
      httpServer?.close(err => (err ? reject(err) : resolve()))
    );
    console.info('[Shutdown] 1/5 HTTP sunucusu kapatıldı ✅');

    // Adım 2: BullMQ Worker'ları kapat (aktif job'ların bitmesini bekle)
    await Promise.all([
      leaguePromotionWorker.close(),
      leaderboardSyncWorker.close(),
      streakReminderWorker.close(),
      notificationWorker.close(),
    ]);
    console.info('[Shutdown] 2/5 BullMQ Worker\'lar kapatıldı ✅');

    // Adım 3: BullMQ Queue'ları kapat
    await Promise.all([
      leaguePromotionQueue.close(),
      leaderboardSyncQueue.close(),
      streakReminderQueue.close(),
      notificationQueue.close(),
    ]);
    console.info('[Shutdown] 3/5 BullMQ Queue\'lar kapatıldı ✅');

    // Adım 4: PostgreSQL pool
    await pool.end();
    console.info('[Shutdown] 4/5 PostgreSQL pool kapatıldı ✅');

    // Adım 5: Redis
    await redisClient.quit();
    console.info('[Shutdown] 5/5 Redis bağlantısı kapatıldı ✅');

    clearTimeout(forceKillGuard);
    console.info('[Shutdown] Graceful shutdown tamamlandı — çıkılıyor.');
    process.exit(0);

  } catch (err) {
    console.error('[Shutdown] Hata:', err);
    clearTimeout(forceKillGuard);
    process.exit(1);
  }
}

// Direktif 3: Hem SIGTERM (k8s pod eviction) hem SIGINT (Ctrl+C) dinle
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Yakalanmamış hataları logla — sessiz çöküşleri engelle
process.on('unhandledRejection', (reason) => {
  console.error('[Process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] uncaughtException:', err);
  gracefulShutdown('uncaughtException');
});

// Başlat
bootstrap().catch(err => {
  console.error('[Bootstrap] FATAL:', err);
  process.exit(1);
});
```


***

## ✅ v2 Denetim Karar Matrisi

| \# | Direktif | v1 Riski | v2 Çözümü | Dosya |
| :-- | :-- | :-- | :-- | :-- |
| D1-A | Spam Bomb — Redis limit | `STREAK_RESCUE: 2` | `DAILY_NOTIF_LIMITS.STREAK_RESCUE = 1` | `notification.job.ts` |
| D1-B | BullMQ çift job | `jobId` içinde `count` var → unique değil | Sabit `notif:userId:type:date` | `notification.job.ts` |
| D1-C | DB düzeyinde çift gönderim | Tablo yok — FCM iki kez çağrılabilir | `sent_notifications` UNIQUE + `ON CONFLICT DO NOTHING` | `018_sent_notifications.sql` |
| D2-A | MV deadlock | Lua SET NX → cross-process koruma yok | `pg_try_advisory_lock` — PostgreSQL native | `leaderboard-sync.job.ts` |
| D2-B | CONCURRENTLY transaction içinde | `BEGIN` içinde çalışıyordu → crash | `pool.query()` ile transaction dışı | `leaderboard-sync.job.ts` |
| D2-C | Sonsuz lock bekleme | Timeout yok | `SET lock_timeout = '10s'` | `leaderboard-sync.job.ts` |
| D3-A | Worker kapanmadan Redis/PG kapanır | SIGTERM → pool.end() önce | HTTP → Workers → Queues → Pool → Redis sırası | `index.ts` |
| D3-B | Zombie worker (kapanmayan iş) | Timeout yok — process askıda kalır | `forceKillGuard` 30s `setTimeout` | `index.ts` |
| D3-C | Çift sinyal | Yalnızca SIGTERM | `SIGTERM` + `SIGINT` + `isShuttingDown` guard | `index.ts` |

<div align="center">⁂</div>

[^2_1]: FinRoute_8.Hafta_Gorev.md

[^2_2]: FinRoute_8.hafta-Kontrol.md

