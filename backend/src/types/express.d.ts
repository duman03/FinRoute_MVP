export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        sub: string;
      };
      idempotencyKey?: string;
    }
  }
}
