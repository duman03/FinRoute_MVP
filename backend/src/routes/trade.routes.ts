import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import idempotency from '../middleware/idempotency';
import validate from '../middleware/validate';
import { logger } from '../utils/logger';
import {
  createTradeSchema,
  listTransactionsQuerySchema,
} from '../validators/trade.validator';
import { getPortfolioById } from '../services/portfolio.service';
import {
  getPrice,
  getHolding,
  createPendingTransaction,
  enqueueTrade,
  listTransactions,
} from '../services/trade.service';

const router = Router();

// All trade routes require auth
router.use(requireAuth);

// ─── POST /portfolios/:id/transactions (P-01 BullMQ flow) ──
router.post(
  '/:id/transactions',
  idempotency,
  validate(createTradeSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub;
      const portfolioId = req.params.id as string;
      const { symbol, type, quantity } = req.body;
      // Convert quantity to string for NUMERIC DB operations
      const quantityStr = String(quantity);

      // Verify portfolio ownership
      const portfolio = await getPortfolioById(portfolioId);
      if (!portfolio) {
        res.status(404).json({
          data: null,
          error: { code: 'PORTFOLIO_NOT_FOUND', message: 'Portfolio not found' },
        });
        return;
      }
      if (portfolio.user_id !== userId) {
        res.status(403).json({
          data: null,
          error: { code: 'FORBIDDEN', message: 'You do not own this portfolio' },
        });
        return;
      }

      // Get price from Redis (or mock)
      const { price, priceSourceTs } = await getPrice(symbol);

      // Golden Rule #4: NUMERIC — compare via Number() only, keep strings for DB
      const totalCost = (Number(quantityStr) * Number(price)).toFixed(4);

      if (type === 'BUY') {
        // Check portfolio.current_balance >= quantity * price
        if (Number(portfolio.current_balance) < Number(totalCost)) {
          res.status(400).json({
            data: null,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: `Insufficient balance. Required: ${totalCost}, Available: ${portfolio.current_balance}`,
            },
          });
          return;
        }
      }

      if (type === 'SELL') {
        // Check holdings quantity >= requested quantity
        const holding = await getHolding(portfolioId, symbol);
        if (!holding || Number(holding.quantity) < Number(quantityStr)) {
          res.status(400).json({
            data: null,
            error: {
              code: 'INSUFFICIENT_HOLDINGS',
              message: `Insufficient holdings for ${symbol}. Available: ${holding ? holding.quantity : '0'}`,
            },
          });
          return;
        }
      }

      // INSERT transaction with status PENDING
      const transaction = await createPendingTransaction(
        portfolioId,
        userId,
        symbol,
        type,
        quantityStr,
        price,
        priceSourceTs
      );

      // Enqueue to BullMQ trade-queue
      await enqueueTrade({
        transactionId: transaction.id,
        portfolioId,
        userId,
        symbol,
        type,
        quantity: quantityStr,
        priceAtExecution: price,
        priceSourceTs,
        sequenceNumber: Number(transaction.sequence_number),
      });

      // Return 202 Accepted
      res.status(202).json({
        data: {
          transaction: {
            id: transaction.id,
            portfolioId: transaction.portfolio_id,
            symbol: transaction.symbol,
            type: transaction.type,
            quantity: transaction.quantity,
            priceAtExecution: transaction.price_at_execution,
            totalAmount: transaction.total_amount,
            status: transaction.status,
            createdAt: transaction.created_at,
          },
          message: 'Transaction queued for processing',
        },
        error: null,
      });
    } catch (err) {
      logger.error('POST /transactions error:', err);
      res.status(500).json({
        data: null,
        error: { code: 'TRANSACTION_ERROR', message: 'Failed to create transaction' },
      });
    }
  }
);

// ─── GET /portfolios/:id/transactions ──────────────────────
router.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const portfolioId = req.params.id as string;

    // Verify ownership
    const portfolio = await getPortfolioById(portfolioId);
    if (!portfolio) {
      res.status(404).json({
        data: null,
        error: { code: 'PORTFOLIO_NOT_FOUND', message: 'Portfolio not found' },
      });
      return;
    }
    if (portfolio.user_id !== userId) {
      res.status(403).json({
        data: null,
        error: { code: 'FORBIDDEN', message: 'You do not own this portfolio' },
      });
      return;
    }

    // Validate query params
    const query = listTransactionsQuerySchema.parse(req.query);

    const result = await listTransactions(portfolioId, query.page, query.limit, {
      status: query.status,
      type: query.type,
      symbol: query.symbol,
    });

    res.status(200).json({
      data: result.transactions,
      error: null,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
      },
    });
  } catch (err) {
    logger.error('GET /transactions error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch transactions' },
    });
  }
});

export default router;
