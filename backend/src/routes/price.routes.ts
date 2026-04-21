import { Router, Request, Response } from 'express';
import { redis } from '../config/redis';
import { getCachedPrice, PricePayload } from '../services/price.service';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/v1/prices
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) {
      return res.status(400).json({ success: false, error: 'symbols query parameter is required' });
    }

    const symbols = symbolsQuery.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    if (symbols.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 symbols allowed per request' });
    }

    const data: Record<string, PricePayload> = {};

    await Promise.all(
      symbols.map(async (symbol) => {
        const cached = await getCachedPrice(symbol);
        if (cached) {
          data[symbol] = cached;
        }
      })
    );

    return res.json({
      success: true,
      data,
      snapshot_at: Date.now(),
    });
  } catch (err: any) {
    logger.error('Error fetching prices from cache:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/prices/replay
router.get('/replay', async (req: Request, res: Response): Promise<any> => {
  try {
    const sinceId = req.query.since_id as string;
    const symbolsQuery = req.query.symbols as string;

    if (!sinceId || !/^\d+-\d+$/.test(sinceId)) {
      return res.status(400).json({ success: false, error: 'Valid since_id is required (e.g. 1710000001000-0)' });
    }

    const filterSymbols = symbolsQuery ? symbolsQuery.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0) : [];

    // Use '(' + since_id for exclusive start in XRANGE
    const startId = '(' + sinceId;

    // Golden Rule: ioredis xrange
    const entries = await redis.xrange('stream:prices', startId, '+', 'COUNT', 200);

    const data: any[] = [];
    let lastId = sinceId;

    for (const entry of entries) {
      // Golden Rule: spaces inside brackets
      const id = entry[0];
      const fields = entry[1];

      let symbolStr = '';
      let payloadObj = null;

      // fields is a flat array: ['symbol', 'AAPL', 'payload', '{"price":182}']
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === 'symbol') {
          symbolStr = fields[i + 1];
        } else if (fields[i] === 'payload') {
          try {
            payloadObj = JSON.parse(fields[i + 1]);
          } catch (e) { }
        }
      }

      if (filterSymbols.length > 0 && symbolStr && !filterSymbols.includes(symbolStr)) {
        continue;
      }

      data.push({
        stream_id: id,
        symbol: symbolStr,
        ...payloadObj
      });

      lastId = id;
    }

    return res.json({
      success: true,
      data,
      count: data.length,
      last_id: lastId,
      replayed_at: Date.now(),
    });
  } catch (err: any) {
    logger.error('Error in price replay:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
