import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import validate from '../middleware/validate';
import requireAuth from '../middleware/auth';
import { env } from '../config/env';
import { TOKEN_CONFIG } from '../config/token';
import { logger } from '../utils/logger';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from '../validators/auth.validator';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  createSession,
  refreshSession,
  deleteSession,
  findUserByEmail,
  findUserById,
  createUser,
} from '../services/auth.service';

const router = Router();

// ─── POST /auth/register ───────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { displayName, email, password } = req.body;

  if (!displayName?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: 'MISSING_FIELDS' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    return;
  }

  try {
    // Duplicate kontrol
    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) {
      res.status(409).json({ error: 'EMAIL_ALREADY_IN_USE' });
      return;
    }

    const passwordHash = await hashPassword(password);

    // INSERT into users table using the existing service function
    const user = await createUser(email.toLowerCase().trim(), passwordHash, displayName.trim());

    // JWT çifti üret
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // EC-18: session SET — requireAuth EXISTS kontrolü için zorunlu
    await createSession(user.id);

    console.info(`[Auth] Register başarılı userId: ${user.id}`);

    res.status(201).json({
      accessToken,
      refreshToken,
      expiresIn: TOKEN_CONFIG.accessTTL,
      user: { id: user.id, displayName: user.display_name },
    });
  } catch (err) {
    console.error('[Auth] Register hatası:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

// ─── POST /auth/login (MVP v4.7 §2.1 — exact code) ────────
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Query user by email — Golden Rule #1: rows[ 0 ]
    const user = await findUserByEmail(email);
    if (!user) {
      res.status(401).json({
        data: null,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    // Check is_active (soft-delete guard)
    if (!user.is_active) {
      res.status(401).json({
        data: null,
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account has been deactivated' },
      });
      return;
    }

    // bcrypt.compare password
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({
        data: null,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    // Sign access + refresh tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // EC-18: SET session:{userId} in Redis
    await createSession(user.id);

    // Return 200 with tokens
    res.status(200).json({
      data: {
        accessToken,
        refreshToken,
        expiresIn: TOKEN_CONFIG.accessTTL,
        user: {
          id: user.id,
          displayName: user.display_name,
          email: user.email,
        },
      },
      error: null,
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'LOGIN_ERROR', message: 'Login failed' },
    });
  }
});

// ─── POST /auth/refresh (MVP v4.7 §2.1 — exact code) ──────
router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as { sub: string; type?: string };

    // Ensure it's a refresh token
    if (decoded.type !== 'refresh') {
      res.status(401).json({
        data: null,
        error: { code: 'INVALID_TOKEN', message: 'Not a refresh token' },
      });
      return;
    }

    // Check user is_active via rows[ 0 ] (Golden Rule #1)
    const dbUser = await findUserById(decoded.sub);

    if (!dbUser || !dbUser.is_active) {
      res.status(401).json({
        data: null,
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account not found or deactivated' },
      });
      return;
    }

    // Sign new access token
    const newAccessToken = generateAccessToken(decoded.sub);

    // EC-19: EXPIRE session:{userId} with TOKEN_CONFIG.accessTTL
    await refreshSession(decoded.sub);

    // Return 200 with new access token
    res.status(200).json({
      data: {
        accessToken: newAccessToken,
        expiresIn: TOKEN_CONFIG.accessTTL,
      },
      error: null,
    });
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        data: null,
        error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token expired, please login again' },
      });
      return;
    }
    if (err.name === 'JsonWebTokenError') {
      res.status(401).json({
        data: null,
        error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' },
      });
      return;
    }
    logger.error('Refresh error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'REFRESH_ERROR', message: 'Token refresh failed' },
    });
  }
});

// ─── POST /auth/logout ─────────────────────────────────────
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    // DEL session:{userId} from Redis
    await deleteSession(userId);

    res.status(200).json({
      data: { message: 'Logged out successfully' },
      error: null,
    });
  } catch (err) {
    logger.error('Logout error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'LOGOUT_ERROR', message: 'Logout failed' },
    });
  }
});

export default router;
