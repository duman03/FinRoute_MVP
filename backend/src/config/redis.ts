import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL);

redis.on('connect', () => logger.info('Redis bağlandı'));
redis.on('ready', () => logger.info('Redis hazır'));
redis.on('error', (err) => logger.error('Redis hatası', err));