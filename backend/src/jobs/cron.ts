import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { tradeQueue } from '../config/bullmq';

export const startCronJobs = () => {
  logger.info('Starting scheduled jobs (CRON 1, 2, 3) using setInterval...');

  // ─── CRON-1: Clean expired idempotency keys ──────────────────
  // Every 60 seconds
  setInterval(async () => {
    try {
      const result = await pool.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()');
      if (result.rowCount && result.rowCount > 0) {
        logger.info(`CRON-1: Cleaned ${result.rowCount} expired idempotency keys`);
      }
    } catch (err: any) {
      logger.error('CRON-1 Error:', err.message);
    }
  }, 60000);

  // ─── CRON-2: Retry transient failures ───────────────────────
  // Every 60 seconds
  setInterval(async () => {
    try {
      const result = await pool.query(
        `SELECT id, portfolio_id, user_id, symbol, type, quantity, price_at_execution, price_source_ts, sequence_number 
         FROM transactions 
         WHERE status = 'FAILED' 
           AND failure_reason = 'OPTIMISTIC_LOCK_CONFLICT'
           AND created_at > NOW() - INTERVAL '5 minutes'
         LIMIT 20`
      );

      const { rows: txnsToRetry } = result;
      if (txnsToRetry[ 0 ]) {
        logger.info(`CRON-2: Found ${result.rowCount} transient failures to retry`);
        for (const txn of txnsToRetry) {
          await tradeQueue.add('process-trade', {
            transactionId: txn.id,
            portfolioId: txn.portfolio_id,
            userId: txn.user_id,
            symbol: txn.symbol,
            type: txn.type,
            quantity: txn.quantity,
            priceAtExecution: txn.price_at_execution,
            priceSourceTs: txn.price_source_ts,
            sequenceNumber: Number(txn.sequence_number),
          }, {
            delay: 500
          });
          logger.info(`CRON-2: Re-enqueued OPTIMISTIC_LOCK_CONFLICT txn ${txn.id} for retry`);
        }
      }
    } catch (err: any) {
      logger.error('CRON-2 Error:', err.message);
    }
  }, 60000);

  // ─── CRON-3: Zombie PENDING reaper (N-02) ───────────────────
  // Every 2 minutes
  setInterval(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, portfolio_id, user_id, symbol, type, quantity, price_at_execution, price_source_ts, sequence_number 
         FROM transactions 
         WHERE status = 'PENDING'
           AND created_at < NOW() - INTERVAL '2 minutes'
           AND sequence_number IS NOT NULL
         LIMIT 50
         FOR UPDATE SKIP LOCKED`
      );

      const { rows: zombies } = result;
      if (zombies[ 0 ]) {
        logger.warn(`CRON-3: Found ${result.rowCount} possible zombie pending transactions`);

        // 1. Check BullMQ if job still active -> skip if active
        // getActive() returns jobs currently processing in memory across workers
        const activeJobs = await tradeQueue.getActive();

        for (const txn of zombies) {
          const isActive = activeJobs.some((j) => j.data?.transactionId === txn.id);

          if (isActive) {
            logger.info(`CRON-3: Skipping txn ${txn.id} as it is currently ACTIVE in BullMQ worker`);
            continue;
          }

          // 2. UPDATE status = 'FAILED', failure_reason = 'REAPED_BY_CRON'
          await client.query(
            `UPDATE transactions SET status = 'FAILED', failure_reason = 'REAPED_BY_CRON', updated_at = NOW() WHERE id = $1`,
            [txn.id]
          );

          // 3. Re-enqueue to BullMQ with new jobId
          await tradeQueue.add('process-trade', {
            transactionId: txn.id,
            portfolioId: txn.portfolio_id,
            userId: txn.user_id,
            symbol: txn.symbol,
            type: txn.type,
            quantity: txn.quantity,
            priceAtExecution: txn.price_at_execution,
            priceSourceTs: txn.price_source_ts,
            sequenceNumber: Number(txn.sequence_number),
          }, {
            jobId: `reap-${txn.id}`,
            attempts: 2,
            delay: 500
          });
          logger.info(`CRON-3: Failed and re-enqueued zombie txn ${txn.id} with jobId reap-${txn.id}`);
        }
      }
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error('CRON-3 Error:', err.message);
    } finally {
      client.release();
    }
  }, 120000);
  
  // ─── CRON-4: Gamification Heartbeat (Streak maintenance) ────
  // Every 4 hours
  setInterval(async () => {
    try {
      // UTC date calculation: Users who haven't checked in for > 1 day from "Today" (UTC)
      // and have 0 freezes left -> streak = 0
      const result = await pool.query(
        `UPDATE user_streaks 
         SET current_streak = 0, updated_at = NOW()
         WHERE last_check_in_date < (CURRENT_DATE - INTERVAL '1 day')
           AND freeze_count = 0
           AND current_streak > 0`
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.info(`CRON-4: Reset ${result.rowCount} lapsed streaks to zero`);
      }
    } catch (err: any) {
      logger.error('CRON-4 Error:', err.message);
    }
  }, 4 * 60 * 60 * 1000);

};
