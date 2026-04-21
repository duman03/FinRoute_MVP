import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// v4.7 §2.2: requireAuth middleware — JWT verify + Redis session EXISTS check
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        data: null,
        error: { code: 'NO_TOKEN', message: 'Authorization header missing' },
      });
      return;
    }

    // Golden Rule #2: split(' ')[ 1 ] — SPACES inside brackets
    const token = authHeader.split(' ')[ 1 ];
    if (!token) {
      res.status(401).json({
        data: null,
        error: { code: 'NO_TOKEN', message: 'Bearer token missing' },
      });
      return;
    }

    // Verify JWT with secret from env
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };

    // Check Redis session: EXISTS session:{userId}
    const sessionExists = await redis.exists(`session:${decoded.sub}`);
    if (sessionExists === 0) {
      res.status(401).json({
        data: null,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session expired or logged out' },
      });
      return;
    }

    // Attach user to request
    (req as any).user = { sub: decoded.sub, id: decoded.sub };
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        data: null,
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
      });
      return;
    }

    if (err.name === 'JsonWebTokenError') {
      res.status(401).json({
        data: null,
        error: { code: 'INVALID_TOKEN', message: 'Invalid access token' },
      });
      return;
    }

    logger.error('Auth middleware unexpected error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'AUTH_ERROR', message: 'Internal authentication error' },
    });
  }
};

export default requireAuth;
