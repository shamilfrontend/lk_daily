import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../middlewares/errorHandler.js';
import { PresentationLog } from '../models/PresentationLog.js';
import { parseMoscowDayInput } from '../utils/dateHelpers.js';

export async function listHistory(req: Request, res: Response): Promise<void> {
  const { teamId, from, to, status } = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};

  if (teamId) {
    if (!mongoose.isValidObjectId(teamId)) {
      throw new HttpError(400, 'Invalid teamId');
    }
    filter.teamId = teamId;
  }
  const dateCond: Record<string, Date> = {};
  if (from) {
    dateCond.$gte = parseMoscowDayInput(from);
  }
  if (to) {
    dateCond.$lte = parseMoscowDayInput(to);
  }
  if (Object.keys(dateCond).length > 0) {
    filter.date = dateCond;
  }
  if (status) {
    if (!['presented', 'skipped', 'no_available'].includes(status)) {
      throw new HttpError(400, 'Invalid status');
    }
    filter.status = status;
  }

  const rows = await PresentationLog.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .populate('teamId', 'name')
    .populate('userId', 'fullName')
    .lean();

  res.json(rows);
}
