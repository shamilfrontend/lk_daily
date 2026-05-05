import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';

import { HttpError } from '../middlewares/errorHandler.js';
import { QueueDaySubstitution } from '../models/QueueDaySubstitution.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';

const moscowDateRe = /^\d{4}-\d{2}-\d{2}$/;

const createBody = Joi.object({
  teamId: Joi.string().required(),
  moscowDate: Joi.string().pattern(moscowDateRe).required(),
  substituteUserId: Joi.string().required(),
});

export async function listSubstitutions(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const q: Record<string, unknown> = { teamId: new mongoose.Types.ObjectId(teamId) };
  if (from && moscowDateRe.test(from) && to && moscowDateRe.test(to)) {
    q.moscowDate = { $gte: from, $lte: to };
  } else if (from && moscowDateRe.test(from)) {
    q.moscowDate = { $gte: from };
  } else if (to && moscowDateRe.test(to)) {
    q.moscowDate = { $lte: to };
  }

  const rows = await QueueDaySubstitution.find(q).sort({ moscowDate: 1 }).lean();
  const subIds = [...new Set(rows.map((r) => r.substituteUserId.toString()))].map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: subIds } }).select('fullName').lean();
  const nameById = new Map(users.map((u) => [u._id.toString(), u.fullName]));

  res.json({
    teamId,
    rows: rows.map((r) => ({
      id: r._id.toString(),
      moscowDate: r.moscowDate,
      substituteUserId: r.substituteUserId.toString(),
      substituteFullName: nameById.get(r.substituteUserId.toString()) ?? '',
    })),
  });
}

export async function createSubstitution(req: Request, res: Response): Promise<void> {
  const { error, value } = createBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const { teamId, moscowDate, substituteUserId } = value as {
    teamId: string;
    moscowDate: string;
    substituteUserId: string;
  };
  if (!mongoose.isValidObjectId(teamId) || !mongoose.isValidObjectId(substituteUserId)) {
    throw new HttpError(400, 'Invalid id');
  }

  const team = await Team.findById(teamId).select('_id').lean();
  if (!team) {
    throw new HttpError(404, 'Team not found');
  }
  const subUser = await User.findOne({
    _id: substituteUserId,
    teamId: team._id,
    isActive: true,
  })
    .select('_id fullName')
    .lean();
  if (!subUser) {
    throw new HttpError(400, 'substituteUserId must be an active user of this team');
  }

  const doc = await QueueDaySubstitution.findOneAndUpdate(
    { teamId: team._id, moscowDate },
    { $set: { substituteUserId: subUser._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  res.json({
    ok: true,
    id: doc!._id.toString(),
    teamId,
    moscowDate,
    substituteUserId: subUser._id.toString(),
    substituteFullName: subUser.fullName,
  });
}

export async function deleteSubstitution(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  const moscowDate = req.query.moscowDate as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  if (!moscowDate || !moscowDateRe.test(moscowDate)) {
    throw new HttpError(400, 'Invalid or missing moscowDate');
  }
  const r = await QueueDaySubstitution.deleteOne({
    teamId: new mongoose.Types.ObjectId(teamId),
    moscowDate,
  });
  res.json({ ok: true, deleted: r.deletedCount > 0 });
}
