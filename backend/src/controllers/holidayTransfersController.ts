import type { Request, Response } from 'express';

import { HttpError } from '../middlewares/errorHandler.js';
import { HolidayTransfer } from '../models/HolidayTransfer.js';
import { utcDateToMoscowDateString } from '../utils/dateHelpers.js';

export async function listHolidayTransfers(
  req: Request,
  res: Response,
): Promise<void> {
  const yearRaw = req.query.year as string | undefined;
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1970 || year > 3000) {
    throw new HttpError(400, 'Invalid year');
  }

  const rows = await HolidayTransfer.find({ year })
    .sort({ fromDate: 1, toDate: 1 })
    .lean();

  res.json({
    year,
    items: rows.map((row) => ({
      id: row._id.toString(),
      fromDate: utcDateToMoscowDateString(row.fromDate),
      toDate: utcDateToMoscowDateString(row.toDate),
      description: row.description,
    })),
  });
}
