import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';

import { HttpError } from '../middlewares/errorHandler.js';
import { PresentationLog } from '../models/PresentationLog.js';
import { User } from '../models/User.js';
import { assertTeamAccess } from '../utils/authz.js';
import {
  parseMoscowDayInput,
  utcDateToMoscowDateString,
} from '../utils/dateHelpers.js';

const statsQuerySchema = Joi.object({
  teamId: Joi.string().required(),
  from: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow(''),
  to: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .allow(''),
});

interface UserAggRow {
  userId: string;
  fullName: string;
  presented: number;
  skipped: number;
  lastMoscowDate: string | null;
}

export async function getTeamStats(req: Request, res: Response): Promise<void> {
  const { error, value } = statsQuerySchema.validate(req.query, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
  });
  if (error) {
    throw new HttpError(400, error.message);
  }

  const teamId = value.teamId as string;
  if (!mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid teamId');
  }
  assertTeamAccess(req.auth, teamId);

  const from = value.from as string | undefined;
  const to = value.to as string | undefined;
  const filter: Record<string, unknown> = {
    teamId: new mongoose.Types.ObjectId(teamId),
  };
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

  const logs = await PresentationLog.find(filter)
    .select('userId status date')
    .sort({ date: -1 })
    .lean();

  let totalPresented = 0;
  let totalSkipped = 0;
  const byUser = new Map<
    string,
    { presented: number; skipped: number; lastMoscowDate: string | null }
  >();

  for (const row of logs) {
    if (row.status === 'presented') {
      totalPresented += 1;
    } else if (row.status === 'skipped') {
      totalSkipped += 1;
    }
    const uid = row.userId?.toString();
    if (!uid) {
      continue;
    }

    let slot = byUser.get(uid);
    if (!slot) {
      slot = { presented: 0, skipped: 0, lastMoscowDate: null };
      byUser.set(uid, slot);
    }
    if (row.status === 'presented') {
      slot.presented += 1;
    } else if (row.status === 'skipped') {
      slot.skipped += 1;
    }

    const d = utcDateToMoscowDateString(row.date as Date);
    if (!slot.lastMoscowDate) {
      slot.lastMoscowDate = d;
    }
  }

  const userIds = [...byUser.keys()].map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  const userDocs =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds } })
          .select('fullName')
          .lean()
      : [];
  const nameById = new Map(
    userDocs.map((u) => [u._id.toString(), u.fullName ?? '']),
  );

  const usersOut: UserAggRow[] = [...byUser.entries()].map(([userId, agg]) => ({
    userId,
    fullName: nameById.get(userId) ?? userId,
    presented: agg.presented,
    skipped: agg.skipped,
    lastMoscowDate: agg.lastMoscowDate,
  }));
  usersOut.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  res.json({
    teamId,
    from: from ?? null,
    to: to ?? null,
    totals: {
      presented: totalPresented,
      skipped: totalSkipped,
      records: logs.length,
    },
    users: usersOut,
  });
}
