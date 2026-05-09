import mongoose from 'mongoose';

import { HttpError } from '../middlewares/errorHandler.js';
import type { AuthPayload } from '../middlewares/authMiddleware.js';

export function assertSuperAdmin(auth: AuthPayload | undefined): void {
  if (!auth) {
    throw new HttpError(401, 'Unauthorized');
  }
  if (auth.role !== 'super') {
    throw new HttpError(403, 'Super admin only');
  }
}

export function assertTeamAccess(
  auth: AuthPayload | undefined,
  teamId: string | undefined,
): void {
  if (!auth) {
    throw new HttpError(401, 'Unauthorized');
  }
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  if (auth.role === 'super') {
    return;
  }
  if (!auth.teamIds.includes(teamId)) {
    throw new HttpError(403, 'Forbidden for this team');
  }
}

/** Для тимлида при запросах списков без явной команды — вернуть только разрешённые teamIds. */
export function allowedTeamIdSet(
  auth: AuthPayload | undefined,
): Set<string> | null {
  if (!auth || auth.role === 'super') {
    return null;
  }
  return new Set(auth.teamIds);
}
