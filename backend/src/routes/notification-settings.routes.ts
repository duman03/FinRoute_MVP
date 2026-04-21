import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import validate from '../middleware/validate';
import { logger } from '../utils/logger';
import { z } from 'zod';
import {
  getNotificationSettings,
  upsertDeviceToken,
  removeDeviceToken,
  updateTimezoneOffset,
  updateNotificationsEnabled,
} from '../services/notification-settings.service';

const router = Router();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const registerDeviceSchema = z.object({
  deviceToken: z
    .string()
    .min(10, 'Device token must be at least 10 characters')
    .max(512, 'Device token must be at most 512 characters'),
});

const updateTimezoneSchema = z.object({
  timezoneOffsetMinutes: z
    .number()
    .int('Timezone offset must be an integer')
    .min(-720, 'Minimum offset is -720 (UTC-12)')
    .max(840, 'Maximum offset is 840 (UTC+14)'),
});

const updateNotifEnabledSchema = z.object({
  enabled: z.boolean(),
});

// ─── GET /notification-settings (requires auth) ─────────────────────────────
// Kullanıcının mevcut bildirim ayarlarını getirir.
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub;
      const settings = await getNotificationSettings(userId);

      if (!settings) {
        res.status(404).json({
          data: null,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
        return;
      }

      res.status(200).json({
        data: {
          deviceToken: settings.device_token,
          timezoneOffsetMinutes: settings.timezone_offset_minutes,
          notificationsEnabled: settings.notifications_enabled,
        },
        error: null,
      });
    } catch (err) {
      logger.error('GET /notification-settings error:', err);
      res.status(500).json({
        data: null,
        error: { code: 'FETCH_ERROR', message: 'Failed to fetch notification settings' },
      });
    }
  }
);

// ─── PUT /notification-settings/device-token (requires auth) ─────────────────
// Expo push cihaz token'ını kaydeder veya günceller.
router.put(
  '/device-token',
  requireAuth,
  validate(registerDeviceSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub;
      const { deviceToken } = req.body;

      const settings = await upsertDeviceToken(userId, deviceToken);

      if (!settings) {
        res.status(404).json({
          data: null,
          error: { code: 'USER_NOT_FOUND', message: 'User not found or deactivated' },
        });
        return;
      }

      res.status(200).json({
        data: {
          deviceToken: settings.device_token,
          timezoneOffsetMinutes: settings.timezone_offset_minutes,
          notificationsEnabled: settings.notifications_enabled,
        },
        error: null,
      });
    } catch (err) {
      logger.error('PUT /notification-settings/device-token error:', err);
      res.status(500).json({
        data: null,
        error: { code: 'UPDATE_ERROR', message: 'Failed to register device token' },
      });
    }
  }
);

// ─── DELETE /notification-settings/device-token (requires auth) ──────────────
// Expo push cihaz token'ını siler (bildirim deregistration).
router.delete(
  '/device-token',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub;
      const removed = await removeDeviceToken(userId);

      if (!removed) {
        res.status(404).json({
          data: null,
          error: { code: 'USER_NOT_FOUND', message: 'User not found or deactivated' },
        });
        return;
      }

      res.status(200).json({
        data: { message: 'Device token removed successfully' },
        error: null,
      });
    } catch (err) {
      logger.error('DELETE /notification-settings/device-token error:', err);
      res.status(500).json({
        data: null,
        error: { code: 'DELETE_ERROR', message: 'Failed to remove device token' },
      });
    }
  }
);

// ─── PATCH /notification-settings/timezone (requires auth) ───────────────────
// Kullanıcının saat dilimi offset'ini günceller (dakika cinsinden).
router.patch(
  '/timezone',
  requireAuth,
  validate(updateTimezoneSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub;
      const { timezoneOffsetMinutes } = req.body;

      const settings = await updateTimezoneOffset(userId, timezoneOffsetMinutes);

      if (!settings) {
        res.status(404).json({
          data: null,
          error: { code: 'USER_NOT_FOUND', message: 'User not found or deactivated' },
        });
        return;
      }

      res.status(200).json({
        data: {
          deviceToken: settings.device_token,
          timezoneOffsetMinutes: settings.timezone_offset_minutes,
          notificationsEnabled: settings.notifications_enabled,
        },
        error: null,
      });
    } catch (err) {
      logger.error('PATCH /notification-settings/timezone error:', err);
      res.status(500).json({
        data: null,
        error: { code: 'UPDATE_ERROR', message: 'Failed to update timezone' },
      });
    }
  }
);

// ─── PATCH /notification-settings/preferences (requires auth) ────────────────
// Bildirim tercihini açar/kapatır (etik opt-out).
router.patch(
  '/preferences',
  requireAuth,
  validate(updateNotifEnabledSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub;
      const { enabled } = req.body;

      const settings = await updateNotificationsEnabled(userId, enabled);

      if (!settings) {
        res.status(404).json({
          data: null,
          error: { code: 'USER_NOT_FOUND', message: 'User not found or deactivated' },
        });
        return;
      }

      res.status(200).json({
        data: {
          deviceToken: settings.device_token,
          timezoneOffsetMinutes: settings.timezone_offset_minutes,
          notificationsEnabled: settings.notifications_enabled,
        },
        error: null,
      });
    } catch (err) {
      logger.error('PATCH /notification-settings/preferences error:', err);
      res.status(500).json({
        data: null,
        error: { code: 'UPDATE_ERROR', message: 'Failed to update notification preferences' },
      });
    }
  }
);

export default router;
