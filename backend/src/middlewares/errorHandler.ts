import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, details: err.details });
    return;
  }

  if (err instanceof Error && err.name === 'ValidationError') {
    res.status(400).json({ message: err.message });
    return;
  }

  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000) {
    res.status(409).json({ message: 'Duplicate key' });
    return;
  }

  logger.error('Unhandled error', { err });
  res.status(500).json({ message: 'Internal server error' });
}
