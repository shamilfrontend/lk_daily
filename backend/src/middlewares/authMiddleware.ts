import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { HttpError } from './errorHandler.js';

export type AdminRole = 'super' | 'team-lead';

export interface AuthPayload {
  adminId: string;
  login: string;
  role: AdminRole;
  teamIds: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

interface JwtAdminClaims {
  adminId: string;
  login: string;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtAdminClaims & { iat?: number; exp?: number };
    if (!mongoose.isValidObjectId(decoded.adminId)) {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
    const admin = await Admin.findById(decoded.adminId).select('login role teamIds').lean();
    if (!admin) {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
    const role: AdminRole = admin.role === 'team-lead' ? 'team-lead' : 'super';
    const teamIds = (admin.teamIds ?? []).map((id) => id.toString());
    req.auth = {
      adminId: admin._id.toString(),
      login: admin.login,
      role,
      teamIds,
    };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'Unauthorized'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtAdminClaims & { iat?: number; exp?: number };
    if (!mongoose.isValidObjectId(decoded.adminId)) {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
    const admin = await Admin.findById(decoded.adminId).select('login role teamIds').lean();
    if (!admin) {
      next(new HttpError(401, 'Unauthorized'));
      return;
    }
    const role: AdminRole = admin.role === 'team-lead' ? 'team-lead' : 'super';
    const teamIds = (admin.teamIds ?? []).map((id) => id.toString());
    req.auth = {
      adminId: admin._id.toString(),
      login: admin.login,
      role,
      teamIds,
    };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}
