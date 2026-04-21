import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface PricePayload {
  symbol: string;
  price: number;
  ts: number;
  source: 'finnhub_rest' | 'mock';
  is_delayed?: boolean;
}

export const fetchAndCachePrice = async (symbol: string): Promise<PricePayload> => {
  let currentPrice = 0;
  let timestamp = Date.now();
  let source: 'finnhub_rest' | 'mock' = 'finnhub_rest';

  try {
    const apiKey = env.FINNHUB_API_KEY || 'demo';
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;

    // Using native fetch
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data && data.c > 0) {
      currentPrice = data.c;
      // Finnhub 't' is unix seconds, converting to ms. If unavailable, use Date.now()
      timestamp = data.t ? data.t * 1000 : Date.now();
    } else {
      throw new Error('Invalid price data from Finnhub or price is 0');
    }
  } catch (err: any) {
    logger.warn(`Failed to fetch price for ${symbol} from Finnhub. Using mock. Error: ${err.message}`);
    // Mock price between 50 and 500
    currentPrice = Number((Math.random() * 450 + 50).toFixed(2));
    timestamp = Date.now();
    source = 'mock';
  }

  const payload: PricePayload = {
    symbol,
    price: currentPrice,
    ts: timestamp,
    source,
  };

  const jsonPayload = JSON.stringify(payload);

  try {
    // Pipeline (ALL in one pipeline)
    const pipeline = redis.pipeline();

    // 1. SET price:<symbol> JSON 'EX' 30
    pipeline.set(`price:${symbol}`, jsonPayload, 'EX', 30);

    // 2. SET price:stale:<symbol> JSON 'EX' 300
    pipeline.set(`price:stale:${symbol}`, jsonPayload, 'EX', 300);

    // 3. PUBLISH ws:price:<symbol> JSON
    pipeline.publish(`ws:price:${symbol}`, jsonPayload);

    // 4. XADD stream:prices MAXLEN ~ 500 * symbol <sym> payload <json>
    // Golden Rule: MAXLEN before *, specific ioredis args format
    pipeline.xadd(
      'stream:prices',
      'MAXLEN',
      '~',
      500,
      '*',
      'symbol',
      symbol,
      'payload',
      jsonPayload
    );

    await pipeline.exec();
  } catch (redisErr: any) {
    logger.error(`Redis pipeline failed for ${symbol}: ${redisErr.message}`);
  }

  return payload;
};

export const getCachedPrice = async (symbol: string): Promise<PricePayload | null> => {
  try {
    // Primary Cache
    const primaryInfo = await redis.get(`price:${symbol}`);
    if (primaryInfo) {
      return JSON.parse(primaryInfo) as PricePayload;
    }

    // Stale Fallback
    const staleInfo = await redis.get(`price:stale:${symbol}`);
    if (staleInfo) {
      const payload = JSON.parse(staleInfo) as PricePayload;
      payload.is_delayed = true;
      return payload;
    }
  } catch (err: any) {
    logger.error(`Error reading cached price for ${symbol}: ${err.message}`);
  }

  return null;
};

export const startPricePolling = (symbols: string[], intervalMs: number = 15000): NodeJS.Timeout => {
  logger.info(`Starting price polling for ${symbols.length} symbols every ${intervalMs}ms`);

  // Initial fetch immediately
  symbols.forEach(symbol => fetchAndCachePrice(symbol).catch(e => {
    logger.error(`Initial fetch error for ${symbol}:`, e.message);
  }));

  // Setup interval
  const interval = setInterval(() => {
    symbols.forEach(symbol => {
      fetchAndCachePrice(symbol).catch(e => {
        logger.error(`Polling error for ${symbol}:`, e.message);
      });
    });
  }, intervalMs);

  return interval;
};
