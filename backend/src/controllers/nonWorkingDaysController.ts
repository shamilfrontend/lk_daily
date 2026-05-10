import type { Request, Response } from 'express';
import mongoose from 'mongoose';

import { HttpError } from '../middlewares/errorHandler.js';
import { Team } from '../models/Team.js';
import { listNonWorkingDaysForYear } from '../services/calendarService.js';

export async function listNonWorkingDays(
  req: Request,
  res: Response,
): Promise<void> {
  const yearRaw = req.query.year as string | undefined;
  const teamId = req.query.teamId as string | undefined;
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1970 || year > 3000) {
    throw new HttpError(400, 'Invalid year');
  }
  let teamRegion: string | undefined;
  if (teamId) {
    if (!mongoose.isValidObjectId(teamId)) {
      throw new HttpError(400, 'Invalid teamId');
    }
    const team = await Team.findById(teamId).select('region').lean();
    if (!team) {
      throw new HttpError(404, 'Team not found');
    }
    teamRegion = team.region;
  }
  const list = await listNonWorkingDaysForYear(year, teamRegion);
  res.json({ year, items: list });
}
