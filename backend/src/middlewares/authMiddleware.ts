import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './errorHandler.js';

export interface AuthPayload {
  adminId: string;
  login: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthPayload & { iat?: number; exp?: number };
    req.auth = { adminId: decoded.adminId, login: decoded.login };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}
