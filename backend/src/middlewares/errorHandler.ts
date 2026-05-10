import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
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

/** Дубликат уникального индекса MongoDB (в т.ч. вложенный `cause`). */
export function isMongoDuplicateKeyError(err: unknown): boolean {
  let cur: unknown = err;
  const seen = new Set<unknown>();
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const { code } = cur as { code?: number | string };
    if (code === 11000 || code === '11000') {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return (
    err instanceof Error &&
    typeof err.message === 'string' &&
    err.message.startsWith('E11000')
  );
}

/** На случай дублирования класса HttpError между чанками/резолвами модулей `instanceof` может ломаться. */
function isHttpErrorLike(err: unknown): err is HttpError {
  if (err instanceof HttpError) {
    return true;
  }
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const o = err as { name?: unknown; status?: unknown; message?: unknown };
  return (
    o.name === 'HttpError' &&
    typeof o.status === 'number' &&
    typeof o.message === 'string'
  );
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || 'Error';
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
  }
  if (typeof err === 'string') {
    return err;
  }
  if (typeof err === 'symbol') {
    return err.toString();
  }
  try {
    const j = JSON.stringify(err);
    if (typeof j === 'string') {
      return j;
    }
  } catch {
    /* circular / non-serializable */
  }
  return String(err);
}

/** Ошибки домена из queue/calendar до преобразования в HttpError (например, если try/catch не сработал). */
function tryMapQueueDomainError(err: unknown): HttpError | null {
  const msg = getErrorMessage(err).split('\n', 1)[0].trim();
  switch (msg) {
    case 'TEAM_NOT_FOUND':
      return new HttpError(404, 'Team not found');
    case 'ALREADY_RECORDED_TODAY':
      return new HttpError(409, 'Already recorded for this team today');
    case 'NON_WORKING_DAY':
      return new HttpError(400, 'Non-working day');
    case 'NO_PRESENTER':
      return new HttpError(400, 'No presenter available');
    case 'NO_QUEUE':
      return new HttpError(400, 'Queue is empty');
    case 'Failed to resolve weekday':
      return new HttpError(400, 'Calendar error: failed to resolve weekday');
    case 'Invalid date':
      return new HttpError(400, 'Invalid date');
    case 'SWAP_NO_PRESENTER':
      return new HttpError(
        400,
        'Cannot swap: missing presenter on one of the dates',
      );
    default:
      return null;
  }
}

function logRequestMeta(req: Request): { requestId?: string } {
  return req.id ? { requestId: req.id } : {};
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  try {
    dispatchError(err, _req, res);
  } catch (nested) {
    logger.error('errorHandler failed', {
      nested,
      original: err,
      ...logRequestMeta(_req),
    });
    if (!res.headersSent) {
      res.status(500).json({
        message: 'Internal server error',
        ...(env.nodeEnv !== 'production'
          ? {
              debug: getErrorMessage(nested),
              debugOriginal: getErrorMessage(err),
            }
          : {}),
      });
    }
  }
}

function dispatchError(err: unknown, _req: Request, res: Response): void {
  if (isHttpErrorLike(err)) {
    const h = err as HttpError;
    res.status(h.status).json({ message: h.message, details: h.details });
    return;
  }

  const domain = tryMapQueueDomainError(err);
  if (domain) {
    res
      .status(domain.status)
      .json({ message: domain.message, details: domain.details });
    return;
  }

  if (err instanceof Error && err.name === 'ValidationError') {
    res.status(400).json({ message: err.message });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: err.message });
    return;
  }

  if (isMongoDuplicateKeyError(err)) {
    res.status(409).json({ message: 'Duplicate key' });
    return;
  }

  /** Нативный драйвер `mongodb` (не наследует `mongoose.Error`). */
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'MongoServerError'
  ) {
    const m = err as { code?: number; message: string };
    if (m.code === 11000 || m.code === 11001) {
      res.status(409).json({ message: 'Duplicate key' });
      return;
    }
    const unavailable =
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Server selection timed out|connection.*closed|pool/i.test(
        m.message,
      );
    const status = unavailable ? 503 : 500;
    res.status(status).json({
      message:
        env.nodeEnv === 'production' && unavailable
          ? 'Service temporarily unavailable'
          : m.message,
    });
    return;
  }

  /** Прочие ошибки Mongoose (кроме уже обработанных выше). */
  if (err instanceof mongoose.Error) {
    const unavailable =
      /ServerSelection|MongoNetwork|ECONNREFUSED|ENOTFOUND|buffering timed out/i.test(
        `${err.name} ${err.message}`,
      );
    const status = unavailable ? 503 : 400;
    const message =
      env.nodeEnv === 'production' && unavailable
        ? 'Service temporarily unavailable'
        : err.message;
    res.status(status).json({ message });
    return;
  }

  logger.error('Unhandled error', {
    err,
    message: getErrorMessage(err),
    ...logRequestMeta(_req),
  });

  if (env.nodeEnv !== 'production') {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code: unknown }).code
        : undefined;
    res.status(500).json({
      message: 'Internal server error',
      debug: getErrorMessage(err),
      name: err instanceof Error ? err.name : typeof err,
      ...(code !== undefined ? { code } : {}),
    });
    return;
  }

  res.status(500).json({ message: 'Internal server error' });
}
