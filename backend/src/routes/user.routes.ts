import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import validate from '../middleware/validate';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { z } from 'zod';
import {
  getUserById,
  updateUser,
  deleteUserAccount,
  executePostDeleteSideEffects,
} from '../services/user.service';

const router = Router();

// ─── Zod Schemas ────────────────────────────────────────────
const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(80, 'Display name must be at most 80 characters')
    .optional(),
  avatarUrl: z
    .string()
    .url('Must be a valid URL')
    .optional(),
}).refine((data) => data.displayName || data.avatarUrl, {
  message: 'At least one field must be provided',
});

const deleteAccountSchema = z.object({
  confirmation: z.string(),
});

// ─── GET /users/me (requires auth) ─────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        virtualBalance: user.virtual_balance,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        // Hafta 9: Bildirim ayarları
        timezoneOffsetMinutes: user.timezone_offset_minutes,
        deviceToken: user.device_token,
        notificationsEnabled: user.notifications_enabled,
      },
      error: null,
    });
  } catch (err) {
    logger.error('GET /me error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch user profile' },
    });
  }
});

// ─── PATCH /users/me (requires auth) ────────────────────────
router.patch('/me', requireAuth, validate(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const { displayName, avatarUrl } = req.body;

    const updatedUser = await updateUser(userId, { displayName, avatarUrl });
    if (!updatedUser) {
      res.status(404).json({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not found or deactivated' },
      });
      return;
    }

    res.status(200).json({
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.display_name,
        virtualBalance: updatedUser.virtual_balance,
        avatarUrl: updatedUser.avatar_url,
        updatedAt: updatedUser.updated_at,
      },
      error: null,
    });
  } catch (err) {
    logger.error('PATCH /me error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'UPDATE_ERROR', message: 'Failed to update profile' },
    });
  }
});

// ─── DELETE /account (MVP v4.7 §1.4 — EC-14) ───────────────
router.delete('/', requireAuth, validate(deleteAccountSchema), async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;

  try {
    // EC-11: Turkish İ/I handling — use toLocaleUpperCase('tr-TR')
    const confirmation = req.body.confirmation.toLocaleUpperCase('tr-TR');
    if (confirmation !== 'HESABIMI SİL') {
      res.status(400).json({
        data: null,
        error: {
          code: 'INVALID_CONFIRMATION',
          message: 'Please send { "confirmation": "HESABIMI SİL" } to confirm account deletion',
        },
      });
      return;
    }

    // EC-14: Acquire Redis NX lock  deletion:lock:{userId} with EX 30
    const lockKey = `deletion:lock:${userId}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');

    if (!lockAcquired) {
      res.status(409).json({
        data: null,
        error: {
          code: 'DELETION_ALREADY_IN_PROGRESS',
          message: 'Account deletion is already in progress',
        },
      });
      return;
    }

    try {
      // BEGIN transaction → soft_delete_user(userId) → COMMIT
      const deletion = await deleteUserAccount(userId);

      // Post-COMMIT side effects (all non-fatal)
      await executePostDeleteSideEffects(userId);

      res.status(200).json({
        data: {
          message: 'Account deleted successfully',
          deletedAt: deletion.deletedAt.toISOString(),
          scheduledForDeletionAt: deletion.scheduledForDeletionAt.toISOString(),
        },
        error: null,
      });
    } finally {
      // Always release deletion lock; failure is non-fatal after DB commit.
      await redis.del(lockKey).catch((lockErr: Error) =>
        logger.error('DELETE /account lock release error (non-fatal):', lockErr)
      );
    }
  } catch (err) {
    logger.error('DELETE /account error:', err);
    if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
      res.status(404).json({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not found or already deleted' },
      });
      return;
    }

    res.status(500).json({
      data: null,
      error: { code: 'DELETION_ERROR', message: 'Account deletion failed' },
    });
  }
});

export default router;
