import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// Generic Zod validation middleware factory
// Usage: router.post('/path', validate(myZodSchema), handler)
const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and replace req.body with validated + transformed data
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: err.issues.map((e: any) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
};

export default validate;
