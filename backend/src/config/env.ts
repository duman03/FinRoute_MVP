import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string(),
  FINNHUB_API_KEY: z.string().optional(),
  EXPO_PUSH_ACCESS_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
