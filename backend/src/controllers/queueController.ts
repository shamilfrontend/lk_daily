import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { HttpError } from '../middlewares/errorHandler.js';
import { User } from '../models/User.js';
import {
  getCurrentPresenter,
  getQueueState,
  getUpcomingPresenters,
  recordPresentation,
  replaceQueueOrder,
  sortQueueAlphabetically,
} from '../services/queueService.js';

const orderBody = Joi.object({
  userIds: Joi.array().items(Joi.string().required()).required(),
});

function mapPresenterError(code: string): HttpError {
  switch (code) {
    case 'ALREADY_RECORDED_TODAY':
      return new HttpError(409, 'Already recorded for this team today');
    case 'NON_WORKING_DAY':
      return new HttpError(400, 'Non-working day');
    case 'NO_PRESENTER':
      return new HttpError(400, 'No presenter available');
    case 'NO_QUEUE':
      return new HttpError(400, 'Queue is empty');
    default:
      return new HttpError(500, code);
  }
}

export async function getCurrent(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  try {
    const result = await getCurrentPresenter(teamId);
    res.json({ teamId, result });
  } catch (e) {
    if (e instanceof Error && e.message === 'TEAM_NOT_FOUND') {
      throw new HttpError(404, 'Team not found');
    }
    throw e;
  }
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  const state = await getQueueState(teamId);
  res.json({ teamId, ...state });
}

export async function getUpcoming(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  const daysRaw = req.query.days as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  const days = daysRaw ? Number(daysRaw) : 7;
  if (!Number.isFinite(days) || days < 1 || days > 60) {
    throw new HttpError(400, 'Invalid days');
  }
  try {
    const rows = await getUpcomingPresenters(teamId, days);
    res.json({ teamId, days, rows });
  } catch (e) {
    if (e instanceof Error && e.message === 'TEAM_NOT_FOUND') {
      throw new HttpError(404, 'Team not found');
    }
    throw e;
  }
}

export async function present(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  try {
    const out = await recordPresentation(teamId, 'presented');
    res.json(out);
  } catch (e) {
    if (e instanceof Error) {
      throw mapPresenterError(e.message);
    }
    throw e;
  }
}

export async function skip(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  try {
    const out = await recordPresentation(teamId, 'skipped');
    res.json(out);
  } catch (e) {
    if (e instanceof Error) {
      throw mapPresenterError(e.message);
    }
    throw e;
  }
}

export async function putOrder(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  const { error, value } = orderBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const ids = value.userIds as string[];
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) {
      throw new HttpError(400, `Invalid user id: ${id}`);
    }
  }
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({
    _id: { $in: objectIds },
    teamId: new mongoose.Types.ObjectId(teamId),
    isActive: true,
  }).lean();
  if (users.length !== objectIds.length) {
    throw new HttpError(400, 'userIds must contain only active users of this team');
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new HttpError(400, 'Duplicate userIds');
    }
    seen.add(id);
  }
  await replaceQueueOrder(new mongoose.Types.ObjectId(teamId), objectIds);
  res.json({ ok: true, userIds: ids });
}

export async function sortOrderAlphabetically(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  const userIds = await sortQueueAlphabetically(new mongoose.Types.ObjectId(teamId));
  res.json({ ok: true, userIds });
}
