import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { HttpError } from '../middlewares/errorHandler.js';
import { NonWorkingDay } from '../models/NonWorkingDay.js';
import { listNonWorkingDaysForYear } from '../services/calendarService.js';
import { parseMoscowDayInput } from '../utils/dateHelpers.js';

const createBody = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  description: Joi.string().allow('', null),
});

export async function listNonWorkingDays(req: Request, res: Response): Promise<void> {
  const yearRaw = req.query.year as string | undefined;
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1970 || year > 3000) {
    throw new HttpError(400, 'Invalid year');
  }
  // teamId зарезервирован под региональные праздники (следующая итерация)
  const list = await listNonWorkingDaysForYear(year);
  res.json({ year, items: list });
}

export async function createCustomNonWorkingDay(req: Request, res: Response): Promise<void> {
  const { error, value } = createBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const date = parseMoscowDayInput(value.date);
  const doc = await NonWorkingDay.create({
    date,
    type: 'custom',
    description: value.description || undefined,
  });
  res.status(201).json(doc);
}

export async function deleteNonWorkingDay(req: Request, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, 'Invalid id');
  }
  const doc = await NonWorkingDay.findById(req.params.id);
  if (!doc) {
    throw new HttpError(404, 'Not found');
  }
  if (doc.type !== 'custom') {
    throw new HttpError(400, 'Only custom non-working days can be deleted');
  }
  await doc.deleteOne();
  res.status(204).send();
}
