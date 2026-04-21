import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import validate from '../middleware/validate';
import { logger } from '../utils/logger';
import {
  createPortfolioSchema,
  listPortfoliosQuerySchema,
  listHoldingsQuerySchema,
} from '../validators/portfolio.validator';
import {
  getUserVirtualBalance,
  createPortfolio,
  listPortfolios,
  getPortfolioById,
  listHoldings,
} from '../services/portfolio.service';

const router = Router();

// All portfolio routes require auth
router.use(requireAuth);

// ─── POST /portfolios ──────────────────────────────────────
router.post('/', validate(createPortfolioSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const { name, description, initial_balance } = req.body;

    // Get user's virtual_balance
    const virtualBalance = await getUserVirtualBalance(userId);
    if (virtualBalance === null) {
      res.status(404).json({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    // Golden Rule #4: Compare as numbers, keep strings for DB operations
    const balance = initial_balance !== undefined ? String(initial_balance) : virtualBalance;

    // Validate initial_balance <= virtual_balance
    if (Number(balance) > Number(virtualBalance)) {
      res.status(400).json({
        data: null,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: `Initial balance cannot exceed virtual balance (${virtualBalance})`,
        },
      });
      return;
    }

    const portfolio = await createPortfolio(userId, name, description, balance);

    res.status(201).json({
      data: portfolio,
      error: null,
    });
  } catch (err) {
    logger.error('POST /portfolios error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'CREATE_ERROR', message: 'Failed to create portfolio' },
    });
  }
});

// ─── GET /portfolios ───────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    // Validate query params
    const query = listPortfoliosQuerySchema.parse(req.query);

    const result = await listPortfolios(userId, query.page, query.limit);

    res.status(200).json({
      data: result.portfolios,
      error: null,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
      },
    });
  } catch (err) {
    logger.error('GET /portfolios error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch portfolios' },
    });
  }
});

// ─── GET /portfolios/:id ───────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const portfolioId = req.params.id as string;

    const portfolio = await getPortfolioById(portfolioId);

    if (!portfolio) {
      res.status(404).json({
        data: null,
        error: { code: 'PORTFOLIO_NOT_FOUND', message: 'Portfolio not found' },
      });
      return;
    }

    // Verify ownership
    if (portfolio.user_id !== userId) {
      res.status(403).json({
        data: null,
        error: { code: 'FORBIDDEN', message: 'You do not own this portfolio' },
      });
      return;
    }

    res.status(200).json({
      data: portfolio,
      error: null,
    });
  } catch (err) {
    logger.error('GET /portfolios/:id error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch portfolio' },
    });
  }
});

// ─── GET /portfolios/:id/holdings ──────────────────────────
router.get('/:id/holdings', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;
    const portfolioId = req.params.id as string;

    // Verify ownership first
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
    const query = listHoldingsQuerySchema.parse(req.query);

    const result = await listHoldings(portfolioId, query.page, query.limit, query.sort);

    res.status(200).json({
      data: result.holdings,
      error: null,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
      },
    });
  } catch (err) {
    logger.error('GET /portfolios/:id/holdings error:', err);
    res.status(500).json({
      data: null,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch holdings' },
    });
  }
});

export default router;
