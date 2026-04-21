import { pool } from '../config/database';
import { logger } from '../utils/logger';

// ── Bildirim Ayarları Tipi ───────────────────────────────────────────────────
export interface NotificationSettings {
  device_token: string | null;
  timezone_offset_minutes: number;
  notifications_enabled: boolean;
}

// ── GET: Kullanıcının mevcut bildirim ayarlarını getir ───────────────────────
export async function getNotificationSettings(
  userId: string
): Promise<NotificationSettings | null> {
  const result = await pool.query<NotificationSettings>(
    `SELECT device_token, timezone_offset_minutes, notifications_enabled
     FROM users
     WHERE id = $1 AND is_active = TRUE`,
    [userId]
  );

  return result.rows[ 0 ] || null;
}

// ── PUT: Expo push cihaz token'ını kaydet/güncelle ───────────────────────────
export async function upsertDeviceToken(
  userId: string,
  deviceToken: string
): Promise<NotificationSettings | null> {
  const result = await pool.query<NotificationSettings>(
    `UPDATE users
     SET device_token = $2,
         updated_at   = NOW()
     WHERE id = $1 AND is_active = TRUE
     RETURNING device_token, timezone_offset_minutes, notifications_enabled`,
    [userId, deviceToken]
  );

  return result.rows[ 0 ] || null;
}

// ── DELETE: Expo push cihaz token'ını sil (bildirim deregistration) ──────────
export async function removeDeviceToken(
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users
     SET device_token = NULL,
         notifications_enabled = FALSE,
         updated_at   = NOW()
     WHERE id = $1 AND is_active = TRUE`,
    [userId]
  );

  return (result.rowCount ?? 0) > 0;
}

// ── PATCH: Timezone offset güncelle ──────────────────────────────────────────
export async function updateTimezoneOffset(
  userId: string,
  timezoneOffsetMinutes: number
): Promise<NotificationSettings | null> {
  const result = await pool.query<NotificationSettings>(
    `UPDATE users
     SET timezone_offset_minutes = $2,
         updated_at              = NOW()
     WHERE id = $1 AND is_active = TRUE
     RETURNING device_token, timezone_offset_minutes, notifications_enabled`,
    [userId, timezoneOffsetMinutes]
  );

  return result.rows[ 0 ] || null;
}

// ── PATCH: Bildirim tercihini aç/kapa ────────────────────────────────────────
export async function updateNotificationsEnabled(
  userId: string,
  enabled: boolean
): Promise<NotificationSettings | null> {
  const result = await pool.query<NotificationSettings>(
    `UPDATE users
     SET notifications_enabled = $2,
         updated_at            = NOW()
     WHERE id = $1 AND is_active = TRUE
     RETURNING device_token, timezone_offset_minutes, notifications_enabled`,
    [userId, enabled]
  );

  return result.rows[ 0 ] || null;
}
