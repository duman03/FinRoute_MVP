import { pool } from '../config/database';
import { redis } from '../config/redis';
import { tradeQueue } from '../config/bullmq';
import { logger } from '../utils/logger';

// ─── Get Mock Price (until Finnhub is connected) ─────────────
// Tries Redis price:{symbol} first, falls back to random 50-500
export const getPrice = async (symbol: string): Promise<{ price: string; priceSourceTs: string }> => {
  // Try Redis cache first
  const cached = await redis.get(`price:${symbol}`);
  if (cached) {
    const parsed = JSON.parse(cached);
    return {
      price: String(parsed.price),
      priceSourceTs: parsed.timestamp || new Date().toISOString(),
    };
  }

  // Mock price for demo — random between 50-500 (NUMERIC safe: string)
  const mockPrice = (Math.random() * 450 + 50).toFixed(4);
  return {
    price: mockPrice,
    priceSourceTs: new Date().toISOString(),
  };
};

// ─── Get Holding for SELL validation ─────────────────────────
export const getHolding = async (portfolioId: string, symbol: string) => {
  const result = await pool.query(
    'SELECT id, quantity, version FROM holdings WHERE portfolio_id = $1 AND symbol = $2',
    [portfolioId, symbol]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ] || null;
};

// ─── Create Pending Transaction ──────────────────────────────
export const createPendingTransaction = async (
  portfolioId: string,
  userId: string,
  symbol: string,
  type: 'BUY' | 'SELL',
  quantity: string,
  priceAtExecution: string,
  priceSourceTs: string
) => {
  const sequenceNumber = await redis.incr(`seq:portfolio:${portfolioId}`);
  await redis.expire(`seq:portfolio:${portfolioId}`, 30 * 24 * 3600);

  const result = await pool.query(
    `INSERT INTO transactions (portfolio_id, user_id, symbol, type, quantity, price_at_execution, price_source_ts, status, sequence_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
     RETURNING id, portfolio_id, user_id, symbol, type, quantity, price_at_execution, total_amount, status, created_at, sequence_number`,
    [portfolioId, userId, symbol, type, quantity, priceAtExecution, priceSourceTs, sequenceNumber]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ];
};

// ─── Enqueue Trade to BullMQ ─────────────────────────────────
export const enqueueTrade = async (data: {
  transactionId: string;
  portfolioId: string;
  userId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  priceAtExecution: string;
  priceSourceTs: string;
  sequenceNumber: number;
}) => {
  const job = await tradeQueue.add('process-trade', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });

  logger.info(`Trade job enqueued: ${job.id} for transaction ${data.transactionId}`);
  return job;
};

// ─── List Transactions ───────────────────────────────────────
export const listTransactions = async (
  portfolioId: string,
  page: number,
  limit: number,
  filters: { status?: string; type?: string; symbol?: string }
) => {
  const offset = (page - 1) * limit;
  const conditions: string[] = ['portfolio_id = $1'];
  const values: any[] = [portfolioId];
  let paramIndex = 2;

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.type) {
    conditions.push(`type = $${paramIndex++}`);
    values.push(filters.type);
  }
  if (filters.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol.toUpperCase());
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM transactions WHERE ${whereClause}`,
    values
  );
  const totalItems = parseInt(countResult.rows[ 0 ].count, 10);

  // Fetch with pagination, ordered by created_at DESC
  const result = await pool.query(
    `SELECT id, portfolio_id, user_id, symbol, type, quantity,
            price_at_execution, total_amount, status, failure_reason, created_at
     FROM transactions
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  const { rows: tradeList } = result;
  return {
    transactions: tradeList,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
    pageSize: limit,
  };
};
