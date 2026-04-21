import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Global Error:', err);

  let statusCode = 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation Error';
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    statusCode: statusCode,
    timestamp: new Date().toISOString()
  });
};

export default errorHandler;