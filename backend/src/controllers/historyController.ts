import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';

import { HttpError } from '../middlewares/errorHandler.js';
import { PresentationLog } from '../models/PresentationLog.js';
import {
  parseMoscowDayInput,
  utcDateToMoscowDateString,
} from '../utils/dateHelpers.js';

type HistoryQuery = {
  teamId?: string;
  from?: string;
  to?: string;
  status?: string;
  page?: number;
  limit?: number;
};

const historyQuerySchema = Joi.object({
  teamId: Joi.string()
    .optional()
    .allow('')
    .custom((value, helpers) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      const s = String(value);
      if (!mongoose.isValidObjectId(s)) {
        return helpers.error('any.invalid');
      }
      return s;
    }),
  from: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow(''),
  to: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow(''),
  status: Joi.string()
    .valid('presented', 'skipped', 'no_available')
    .optional()
    .allow(''),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

function buildHistoryFilter(query: HistoryQuery): Record<string, unknown> {
  const { teamId, from, to, status } = query;
  const filter: Record<string, unknown> = {};

  if (teamId) {
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
    filter.status = status;
  }

  return filter;
}

function validateHistoryQuery(query: unknown): HistoryQuery {
  const { error, value } = historyQuerySchema.validate(query, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
  });
  if (error) {
    throw new HttpError(400, error.message);
  }
  return value as HistoryQuery;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function listHistory(req: Request, res: Response): Promise<void> {
  const query = validateHistoryQuery(req.query);
  const filter = buildHistoryFilter(query);
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    PresentationLog.countDocuments(filter),
    PresentationLog.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('teamId', 'name')
      .populate('userId', 'fullName')
      .lean(),
  ]);

  res.json({ rows, total, page, limit });
}

const MAX_HISTORY_CSV_ROWS = 5000;

export async function exportHistoryCsv(
  req: Request,
  res: Response,
): Promise<void> {
  const filter = buildHistoryFilter(validateHistoryQuery(req.query));

  const rows = await PresentationLog.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(MAX_HISTORY_CSV_ROWS)
    .populate('teamId', 'name')
    .populate('userId', 'fullName')
    .lean();

  const lines: string[] = ['date,team,user,status'];
  for (const row of rows) {
    const dateStr = utcDateToMoscowDateString(row.date as Date);
    const team =
      row.teamId && typeof row.teamId === 'object' && 'name' in row.teamId
        ? String((row.teamId as { name?: string }).name ?? '')
        : '';
    const user =
      row.userId &&
      typeof row.userId === 'object' &&
      row.userId !== null &&
      'fullName' in row.userId
        ? String((row.userId as { fullName?: string }).fullName ?? '')
        : '';
    lines.push(
      [dateStr, team, user, row.status]
        .map((c) => csvEscape(String(c)))
        .join(','),
    );
  }

  const body = `\uFEFF${lines.join('\n')}\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="lk-daily-history.csv"',
  );
  res.send(body);
}
