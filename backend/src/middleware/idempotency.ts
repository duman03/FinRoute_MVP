import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// A-02: Idempotency middleware — duplicate trade prevention
const idempotency = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract key from either header name
    const idempotencyKey = req.headers['idempotency-key'] as string
      || req.headers['x-idempotency-key'] as string;

    // Only enforce on POST requests
    if (req.method === 'POST' && !idempotencyKey) {
      res.status(400).json({
        data: null,
        error: {
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key header is required for trade requests',
        },
      });
      return;
    }

    if (!idempotencyKey) {
      return next();
    }

    const userId = (req as any).user?.sub;
    if (!userId) {
      res.status(401).json({
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    // Check idempotency_keys table
    const existing = await pool.query(
      'SELECT response, status_code FROM idempotency_keys WHERE key = $1 AND user_id = $2',
      [idempotencyKey, userId]
    );

    if (existing.rows[ 0 ]) {
      const row = existing.rows[ 0 ];

      // Eğer status_code 0'dan büyükse işlem çoktan bitmiş ve response kaydedilmiştir (Önbellekten dön).
      if (row.status_code > 0) {
        res.status(row.status_code).json(row.response);
        return;
      }

      // Eğer status_code 0 ise işlem şu an BullMQ veya veritabanı tarafında işleniyor demektir (In-progress).
      res.status(409).json({
        data: null,
        error: {
          code: 'DUPLICATE_IN_PROGRESS',
          message: 'A request with this idempotency key is already being processed',
        },
      });
      return;
    }

    // Key doesn't exist → INSERT with empty JSON '{}' instead of NULL to satisfy DB constraints
    await pool.query(
      `INSERT INTO idempotency_keys (key, user_id, response, status_code)
       VALUES ($1, $2, '{}', 0)`,
      [idempotencyKey, userId]
    );

    // Attach idempotency key to request for later use by trade service
    (req as any).idempotencyKey = idempotencyKey;

    next();
  } catch (err: any) {
    // Handle unique constraint violation (race condition — another request inserted first)
    if (err.code === '23505') {
      res.status(409).json({
        data: null,
        error: {
          code: 'DUPLICATE_IN_PROGRESS',
          message: 'A request with this idempotency key is already being processed',
        },
      });
      return;
    }

    logger.error('Idempotency middleware error:', err);
    next(err);
  }
};

export default idempotency;
