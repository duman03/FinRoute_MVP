import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { TOKEN_CONFIG } from '../config/token';
import { logger } from '../utils/logger';

const SALT_ROUNDS = 12;

// ─── Password Helpers ────────────────────────────────────────
export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// ─── Token Generation ────────────────────────────────────────
// EC-19: TOKEN_CONFIG.accessTTL is the single source for all TTL values
export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: TOKEN_CONFIG.accessTTL,
  });
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.JWT_SECRET, {
    expiresIn: TOKEN_CONFIG.refreshTTL,
  });
};

// ─── Redis Session Management ────────────────────────────────
// EC-18: SET session:{userId} with TTL
export const createSession = async (userId: string): Promise<void> => {
  await redis.set(`session:${userId}`, '1', 'EX', TOKEN_CONFIG.accessTTL);
};

export const refreshSession = async (userId: string): Promise<void> => {
  await redis.expire(`session:${userId}`, TOKEN_CONFIG.accessTTL);
};

export const deleteSession = async (userId: string): Promise<void> => {
  await redis.del(`session:${userId}`);
};

// ─── User Queries ────────────────────────────────────────────
export const findUserByEmail = async (email: string) => {
  const result = await pool.query(
    'SELECT id, email, password_hash, display_name, is_active FROM users WHERE email = $1',
    [email]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ] || null;
};

export const findUserById = async (userId: string) => {
  const result = await pool.query(
    'SELECT id, email, display_name, is_active FROM users WHERE id = $1',
    [userId]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ] || null;
};

export const createUser = async (
  email: string,
  passwordHash: string,
  displayName: string
) => {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, virtual_balance, created_at`,
    [email, passwordHash, displayName]
  );
  // Golden Rule #1: rows[ 0 ] — SPACES inside brackets
  return result.rows[ 0 ];
};
