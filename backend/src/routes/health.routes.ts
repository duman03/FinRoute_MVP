import { Router } from 'express';
import { pool } from '../config/database';
import { redis } from '../config/redis';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.status(200).json({ status: 'ok', services: { postgres: 'up', redis: 'up' }, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'error', services: { postgres: 'down', redis: 'down' }, timestamp: new Date().toISOString() });
  }
});

export default router;