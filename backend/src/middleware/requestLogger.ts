import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl === '/api/v1/health' && process.env.NODE_ENV === 'production') {
      return; // Skip health check logs in production
    }
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });

  next();
};

export default requestLogger;