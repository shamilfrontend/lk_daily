import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const MAX_LEN = 128;

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers['x-request-id'];
  const fromHeader = typeof raw === 'string' ? raw.trim() : '';
  const id =
    fromHeader.length > 0 && fromHeader.length <= MAX_LEN
      ? fromHeader.slice(0, MAX_LEN)
      : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
