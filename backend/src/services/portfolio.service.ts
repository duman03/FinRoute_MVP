import { pool } from '../config/database';
import { logger } from '../utils/logger';

// ─── Get User Virtual Balance ────────────────────────────────
export const getUserVirtualBalance = async (userId: string): Promise<string | null> => {
  const result = await pool.query(
    'SELECT virtual_balance FROM users WHERE id = $1 AND is_active = TRUE',
    [userId]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  const row = result.rows[ 0 ];
  return row ? row.virtual_balance : null;
};

// ─── Create Portfolio ────────────────────────────────────────
export const createPortfolio = async (
  userId: string,
  name: string,
  description: string | undefined,
  initialBalance: string
) => {
  const result = await pool.query(
    `INSERT INTO portfolios (user_id, name, description, initial_balance, current_balance)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING id, user_id, name, description, initial_balance, current_balance, created_at, updated_at`,
    [userId, name, description || null, initialBalance]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ];
};

// ─── List Portfolios (with holdings count subquery) ──────────
export const listPortfolios = async (
  userId: string,
  page: number,
  limit: number
) => {
  const offset = (page - 1) * limit;

  // Count total
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM portfolios WHERE user_id = $1',
    [userId]
  );
  const totalItems = parseInt(countResult.rows[ 0 ].count, 10);

  // Fetch with holdings_count subquery
  const result = await pool.query(
    `SELECT p.id, p.name, p.description, p.initial_balance, p.current_balance,
            p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM holdings h WHERE h.portfolio_id = p.id) AS holdings_count
     FROM portfolios p
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const { rows: portfolioData } = result;
  return {
    portfolios: portfolioData,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
    pageSize: limit,
  };
};

// ─── Get Single Portfolio ────────────────────────────────────
export const getPortfolioById = async (portfolioId: string) => {
  const result = await pool.query(
    `SELECT p.id, p.user_id, p.name, p.description, p.initial_balance, p.current_balance,
            p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM holdings h WHERE h.portfolio_id = p.id) AS holdings_count
     FROM portfolios p
     WHERE p.id = $1`,
    [portfolioId]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ] || null;
};

// ─── List Holdings for Portfolio ─────────────────────────────
export const listHoldings = async (
  portfolioId: string,
  page: number,
  limit: number,
  sort: 'symbol' | 'quantity'
) => {
  const offset = (page - 1) * limit;
  const orderBy = sort === 'quantity' ? 'h.quantity DESC' : 'h.symbol ASC';

  // Count total
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM holdings WHERE portfolio_id = $1',
    [portfolioId]
  );
  const totalItems = parseInt(countResult.rows[ 0 ].count, 10);

  // Fetch holdings — current_price will come from Redis in later weeks
  const result = await pool.query(
    `SELECT h.id, h.symbol, h.quantity, h.avg_cost_basis, h.version,
            h.created_at, h.updated_at
     FROM holdings h
     WHERE h.portfolio_id = $1
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [portfolioId, limit, offset]
  );

  const { rows: holdingData } = result;
  return {
    holdings: holdingData,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
    pageSize: limit,
  };
};
