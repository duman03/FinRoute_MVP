# Hafta 9 Backend Entegrasyonu — Walkthrough

## Yapılan Değişiklikler

### Yeni Dosyalar (5 adet)

| Dosya | Amaç |
|:------|:-----|
| [019_user_xp_totals_mv.sql](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/migrations/019_user_xp_totals_mv.sql) | `user_xp_totals` MV + unique index (CONCURRENTLY refresh) |
| [020_users_timezone_device.sql](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/migrations/020_users_timezone_device.sql) | `timezone_offset_minutes`, `device_token`, `notifications_enabled` |
| [021_sent_notifications.sql](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/migrations/021_sent_notifications.sql) | `sent_notifications` idempotency tablosu |
| [notification.job.ts](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/src/jobs/notification.job.ts) | BullMQ `notification-q` + 3 katmanlı dedup + mock FCM |
| [streak-reminder.job.ts](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/src/jobs/streak-reminder.job.ts) | Saatlik smart timezone cron (19:00-20:59 penceresi) |

### Değiştirilen Dosyalar (3 adet)

| Dosya | Değişiklik |
|:------|:-----------|
| [leaderboard-sync.job.ts](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/src/jobs/leaderboard-sync.job.ts) | [handleFullReconcile](file:///c:/Users/Victus/Desktop/%C4%B0%C5%9F%20Modeli/FinRoute_MVP/backend/src/jobs/leaderboard-sync.job.ts#77-165) v2: `pg_try_advisory_lock` + MV refresh TX dışında |
| [league-promotion.job.ts](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/src/jobs/league-promotion.job.ts) | [distributeWinnerReward](file:///c:/Users/Victus/Desktop/%C4%B0%C5%9F%20Modeli/FinRoute_MVP/backend/src/jobs/league-promotion.job.ts#61-120) → `LEAGUE_PROMOTED` bildirim entegrasyonu |
| [index.ts](file:///c:/Users/Victus/Desktop/İş%20Modeli/FinRoute_MVP/backend/src/index.ts) | Bootstrap (streak-reminder cron) + Graceful Shutdown v2 (5 adımlı sıralı kapanma + 30s guard) |

---

## Blueprint'ten Sapma Notları

| Konu | Blueprint | Gerçek Uygulama | Neden |
|:-----|:----------|:----------------|:------|
| Kolon adları | `userid`, `xpgained` | `user_id`, `xp` | Mevcut DB convention'ı `snake_case` |
| Redis API | `node-redis` v4 syntax | `ioredis` syntax | Proje `ioredis` kullanıyor |
| BullMQ connection | `{ connection: redisClient }` | `{ url: env.REDIS_URL }` | Mevcut pattern |
| Modulo formülü | `% 24` | [(% 24 + 24) % 24](file:///c:/Users/Victus/Desktop/%C4%B0%C5%9F%20Modeli/FinRoute_MVP/backend/src/config/database.ts#22-23) | Negatif offset'lerde doğru sonuç |

## Doğrulama

- ✅ `npx tsc --noEmit` — 0 hata
- ⏳ Migration SQL çalıştırma — Docker ortamında kullanıcı tarafından yapılacak
