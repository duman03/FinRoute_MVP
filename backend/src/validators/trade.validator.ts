import { z } from 'zod';

// Trade Zod validation schemas

export const createTradeSchema = z.object({
  symbol: z.string().min(1).max(20).transform((val) => val.toUpperCase()),
  type: z.enum(['BUY', 'SELL']),
  quantity: z.union([z.number(), z.string()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value > 0, 'Quantity must be a positive number'),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']).optional(),
  type: z.enum(['BUY', 'SELL']).optional(),
  symbol: z.string().max(20).optional(),
});

// Type exports
export type CreateTradeInput = z.infer<typeof createTradeSchema>;
