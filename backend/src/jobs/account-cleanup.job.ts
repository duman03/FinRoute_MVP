import cron, { ScheduledTask } from 'node-cron';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function runAccountCleanup(): Promise<number> {
  const result = await pool.query<{
    permanently_delete_expired_users: number;
  }>('SELECT permanently_delete_expired_users()');

  const count = Number(result.rows[ 0 ]?.permanently_delete_expired_users ?? 0);
  logger.info(`[AccountCleanup] ${count} expired account(s) permanently deleted.`);
  return count;
}

export function scheduleAccountCleanupCron(): ScheduledTask {
  const task = cron.schedule(
    '0 2 * * *',
    () => {
      runAccountCleanup().catch((err: Error) =>
        logger.error('[AccountCleanup] Permanent deletion failed:', err)
      );
    },
    { timezone: 'UTC' }
  );

  logger.info('[AccountCleanup] Daily permanent deletion cron registered for 02:00 UTC.');
  return task;
}
