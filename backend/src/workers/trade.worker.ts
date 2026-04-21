import { Job, UnrecoverableError, Worker } from 'bullmq';
import { pool } from '../config/database';
import { env } from '../config/env';
import { xpEventQueue } from '../config/bullmq';
import { enqueueTradeCreatedMissionEvent } from '../services/mission-event.service';
import { logger } from '../utils/logger';

interface TradeJobData {
  transactionId: string;
  portfolioId: string;
  userId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  priceAtExecution: string;
  priceSourceTs: string;
  sequenceNumber: number;
}

const processTrade = async (job: Job<TradeJobData>) => {
  const {
    transactionId,
    portfolioId,
    userId,
    symbol,
    type,
    quantity,
    priceAtExecution,
    sequenceNumber,
  } = job.data;
  const client = await pool.connect();

  const totalAmount = (Number(quantity) * Number(priceAtExecution)).toFixed(4);

  try {
    await client.query('BEGIN');

    const maxSeqResult = await client.query(
      "SELECT MAX(sequence_number) AS max_seq FROM transactions WHERE portfolio_id = $1 AND status = 'COMPLETED'",
      [portfolioId]
    );
    const maxSeqRow = maxSeqResult.rows[ 0 ];
    if (maxSeqRow && maxSeqRow.max_seq !== null) {
      const lastCompletedSeq = Number(maxSeqRow.max_seq);
      if (sequenceNumber <= lastCompletedSeq) {
        throw new UnrecoverableError('SEQUENCE_STALE');
      }
    }

    const userResult = await client.query(
      'SELECT virtual_balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const user = userResult.rows[ 0 ];
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (type === 'BUY' && Number(user.virtual_balance) < Number(totalAmount)) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    if (type === 'SELL') {
      const holdingResult = await client.query(
        'SELECT quantity, version FROM holdings WHERE portfolio_id = $1 AND symbol = $2 FOR UPDATE',
        [portfolioId, symbol]
      );
      const holding = holdingResult.rows[ 0 ];
      if (!holding || Number(holding.quantity) < Number(quantity)) {
        throw new Error('INSUFFICIENT_HOLDINGS');
      }
    }

    if (type === 'BUY') {
      await client.query(
        'UPDATE users SET virtual_balance = virtual_balance - $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, userId]
      );
    } else {
      await client.query(
        'UPDATE users SET virtual_balance = virtual_balance + $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, userId]
      );
    }

    if (type === 'BUY') {
      const existingResult = await client.query(
        'SELECT version, quantity, avg_cost_basis FROM holdings WHERE portfolio_id = $1 AND symbol = $2',
        [portfolioId, symbol]
      );
      const existing = existingResult.rows[ 0 ];

      if (existing) {
        const oldQty = Number(existing.quantity);
        const newQty = Number(quantity);
        const oldAvg = Number(existing.avg_cost_basis);
        const newAvgCost = ((oldQty * oldAvg + newQty * Number(priceAtExecution)) / (oldQty + newQty)).toFixed(4);

        await client.query(
          'SELECT update_holding_with_lock($1, $2, $3, $4, $5)',
          [portfolioId, symbol, quantity, existing.version, newAvgCost]
        );
      } else {
        await client.query(
          `INSERT INTO holdings (portfolio_id, user_id, symbol, quantity, avg_cost_basis)
           VALUES ($1, $2, $3, $4, $5)`,
          [portfolioId, userId, symbol, quantity, priceAtExecution]
        );
      }
    } else {
      const existingResult = await client.query(
        'SELECT version, quantity, avg_cost_basis FROM holdings WHERE portfolio_id = $1 AND symbol = $2',
        [portfolioId, symbol]
      );
      const existing = existingResult.rows[ 0 ];
      const negativeDelta = '-' + quantity;

      await client.query(
        'SELECT update_holding_with_lock($1, $2, $3, $4, $5)',
        [portfolioId, symbol, negativeDelta, existing.version, existing.avg_cost_basis]
      );
    }

    if (type === 'BUY') {
      await client.query(
        'UPDATE portfolios SET current_balance = current_balance - $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, portfolioId]
      );
    } else {
      await client.query(
        'UPDATE portfolios SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, portfolioId]
      );
    }

    await client.query(
      "UPDATE transactions SET status = 'COMPLETED' WHERE id = $1",
      [transactionId]
    );

    const responseSnapshot = {
      data: {
        transactionId,
        portfolioId,
        symbol,
        type,
        quantity,
        priceAtExecution,
        totalAmount,
        status: 'COMPLETED',
        sequenceNumber,
      },
      error: null,
    };

    await client.query(
      `UPDATE idempotency_keys
       SET response = $1, status_code = 200
       WHERE key = (
         SELECT key FROM idempotency_keys
         WHERE user_id = $2
         ORDER BY created_at DESC
         LIMIT 1
       ) AND user_id = $2`,
      [JSON.stringify(responseSnapshot), userId]
    );

    await client.query('COMMIT');

    logger.info(`Trade ${transactionId} completed: ${type} ${quantity} ${symbol} @ ${priceAtExecution}`);

    try {
      await xpEventQueue.add('xp-event', {
        userId,
        eventType: 'TRADE_EXECUTED',
        metadata: {
          transactionId,
          portfolioId,
          symbol,
          type,
          quantity,
          priceAtExecution,
          totalAmount,
          sequenceNumber,
        },
      });
    } catch (error) {
      logger.warn(`XP event queue add failed for trade ${transactionId}: ${(error as Error).message}`);
    }

    try {
      await enqueueTradeCreatedMissionEvent({
        userId,
        tradeId: transactionId,
        symbol,
        action: type,
        eventTime: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn(`Mission event queue add failed for trade ${transactionId}: ${(error as Error).message}`);
    }

    return { success: true, transactionId };
  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error.message === 'SEQUENCE_STALE' || error instanceof UnrecoverableError) {
      try {
        await pool.query(
          "UPDATE transactions SET status = 'FAILED', failure_reason = $1 WHERE id = $2",
          ['SEQUENCE_STALE', transactionId]
        );
      } catch (updateError) {
      }

      logger.error(`Trade ${transactionId} failed: SEQUENCE_STALE. Not retrying.`);
      throw error;
    }

    try {
      await pool.query(
        "UPDATE transactions SET status = 'FAILED', failure_reason = $1 WHERE id = $2",
        [error.message, transactionId]
      );
    } catch (updateError) {
      logger.error(`Failed to update transaction ${transactionId} status:`, updateError);
    }

    logger.error(`Trade ${transactionId} failed:`, error.message);
    throw error;
  } finally {
    client.release();
  }
};

const tradeWorker = new Worker('trade-queue', processTrade, {
  connection: { url: env.REDIS_URL },
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
  removeOnComplete: { count: 100 },
});

tradeWorker.on('completed', (job) => {
  logger.info(`Trade worker: job ${job.id} completed`);
});

tradeWorker.on('failed', (job, error) => {
  logger.error(`Trade worker: job ${job?.id} failed:`, error.message);
});

tradeWorker.on('error', (error) => {
  logger.error('Trade worker error:', error);
});

export default tradeWorker;
