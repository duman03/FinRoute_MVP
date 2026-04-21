import { Pool } from 'pg';
import { env } from './env';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Database connection error', err);
  } else {
    logger.info('PostgreSQL connected');
  }
});

export const query = (text: string, params?: any[]) => pool.query(text, params);