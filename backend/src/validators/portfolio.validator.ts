import { z } from 'zod';

// Portfolio Zod validation schemas

export const createPortfolioSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  initial_balance: z.number().positive().optional(),
});

// Query params validation
export const listPortfoliosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listHoldingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['symbol', 'quantity']).default('symbol'),
});

// Type exports
export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;
