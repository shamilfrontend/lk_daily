import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { HttpError } from '../middlewares/errorHandler.js';
import { User } from '../models/User.js';
import { Vacation } from '../models/Vacation.js';
import { parseMoscowDayInput, utcDateToMoscowDateString } from '../utils/dateHelpers.js';

const createBody = Joi.object({
  userId: Joi.string().required(),
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
});

const updateBody = Joi.object({
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
}).min(1);

export async function listVacations(req: Request, res: Response): Promise<void> {
  const { userId, teamId, fromDate, toDate } = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};

  if (userId) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new HttpError(400, 'Invalid userId');
    }
    filter.userId = userId;
  } else if (teamId) {
    if (!mongoose.isValidObjectId(teamId)) {
      throw new HttpError(400, 'Invalid teamId');
    }
    const users = await User.find({ teamId }).select('_id').lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }

  if (fromDate && toDate) {
    const from = parseMoscowDayInput(fromDate);
    const to = parseMoscowDayInput(toDate);
    filter.$and = [{ startDate: { $lte: to } }, { endDate: { $gte: from } }];
  } else if (fromDate) {
    filter.endDate = { $gte: parseMoscowDayInput(fromDate) };
  } else if (toDate) {
    filter.startDate = { $lte: parseMoscowDayInput(toDate) };
  }

  const list = await Vacation.find(filter).sort({ startDate: 1 }).lean();
  res.json(list);
}

export async function createVacation(req: Request, res: Response): Promise<void> {
  const { error, value } = createBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  if (!mongoose.isValidObjectId(value.userId)) {
    throw new HttpError(400, 'Invalid userId');
  }
  const user = await User.findById(value.userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  const startDate = parseMoscowDayInput(value.startDate);
  const endDate = parseMoscowDayInput(value.endDate);
  if (utcDateToMoscowDateString(startDate) > utcDateToMoscowDateString(endDate)) {
    throw new HttpError(400, 'startDate must be <= endDate');
  }
  const v = await Vacation.create({ userId: user._id, startDate, endDate });
  res.status(201).json(v);
}

export async function updateVacation(req: Request, res: Response): Promise<void> {
  const { error, value } = updateBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, 'Invalid id');
  }
  const v = await Vacation.findById(req.params.id);
  if (!v) {
    throw new HttpError(404, 'Vacation not found');
  }
  const start = value.startDate ? parseMoscowDayInput(value.startDate) : v.startDate;
  const end = value.endDate ? parseMoscowDayInput(value.endDate) : v.endDate;
  if (utcDateToMoscowDateString(start) > utcDateToMoscowDateString(end)) {
    throw new HttpError(400, 'startDate must be <= endDate');
  }
  v.startDate = start;
  v.endDate = end;
  await v.save();
  res.json(v);
}

export async function deleteVacation(req: Request, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, 'Invalid id');
  }
  const v = await Vacation.findByIdAndDelete(req.params.id);
  if (!v) {
    throw new HttpError(404, 'Vacation not found');
  }
  res.status(204).send();
}
