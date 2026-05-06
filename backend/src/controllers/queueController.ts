import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';

import { HttpError, isMongoDuplicateKeyError } from '../middlewares/errorHandler.js';
import { User } from '../models/User.js';
import { assertTeamAccess } from '../utils/authz.js';
import {
  getCurrentPresenter,
  getQueueInsightsForToday,
  getQueueState,
  getUpcomingPresenters,
  presentationLogExistsForTeamMoscowDay,
  recordPresentation,
  replaceQueueOrder,
  sortQueueAlphabetically,
} from '../services/queueService.js';
import { formatMoscowWeekdayLongRu, getMoscowDateString } from '../utils/dateHelpers.js';
import { buildIcsCalendar, type IcsEventInput } from '../utils/ics.js';

const orderBody = Joi.object({
  userIds: Joi.array().items(Joi.string().required()).required(),
});

const skipBody = Joi.object({
  rotate: Joi.boolean().default(true),
});

function mapPresenterError(code: string): HttpError {
  switch (code) {
    case 'TEAM_NOT_FOUND':
      return new HttpError(404, 'Team not found');
    case 'ALREADY_RECORDED_TODAY':
      return new HttpError(409, 'Already recorded for this team today');
    case 'NON_WORKING_DAY':
      return new HttpError(400, 'Non-working day');
    case 'NO_PRESENTER':
      return new HttpError(400, 'No presenter available');
    case 'NO_QUEUE':
      return new HttpError(400, 'Queue is empty');
    case 'SWAP_NO_PRESENTER':
      return new HttpError(400, 'Cannot swap: missing presenter on one of the dates');
    default:
      return new HttpError(500, code);
  }
}

/** Явный `throw`, чтобы ошибка гарантированно уходила в `asyncHandler` → `errorHandler`. */
function throwPresentationHttpError(e: unknown): never {
  if (isMongoDuplicateKeyError(e)) {
    throw new HttpError(409, 'Already recorded for this team today');
  }
  if (e instanceof mongoose.Error.CastError) {
    throw new HttpError(400, e.message);
  }
  if (e instanceof Error) {
    throw mapPresenterError(e.message);
  }
  throw e;
}

export async function getCurrent(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  try {
    const moscowToday = getMoscowDateString(new Date());
    const [result, insights, alreadyRecordedToday] = await Promise.all([
      getCurrentPresenter(teamId),
      getQueueInsightsForToday(teamId),
      presentationLogExistsForTeamMoscowDay(teamId, moscowToday),
    ]);
    res.json({ teamId, result, insights, alreadyRecordedToday });
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

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportUpcomingIcs(req: Request, res: Response): Promise<void> {
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
    const events: IcsEventInput[] = rows.map((row) => {
      const ymd = row.moscowDate.replaceAll('-', '');
      const presenterName = row.presenter?.fullName ?? 'Нет докладчика';
      const summary = `Докладчик: ${presenterName}`;
      const description = row.substitution
        ? `Вместо: ${row.substitution.canonicalFullName}`
        : undefined;
      return {
        uid: `lk-daily-${teamId}-${row.moscowDate}@lk-daily`,
        dateYmd: ymd,
        summary,
        description,
      };
    });
    const body = buildIcsCalendar('-//LK Daily//RU', events);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lk-daily-upcoming.ics"');
    res.send(body);
  } catch (e) {
    if (e instanceof Error && e.message === 'TEAM_NOT_FOUND') {
      throw new HttpError(404, 'Team not found');
    }
    throw e;
  }
}

export async function exportUpcomingCsv(req: Request, res: Response): Promise<void> {
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
    const lines: string[] = ['moscowDate,weekday,presenter'];
    for (const row of rows) {
      const presenter = row.presenter?.fullName ?? '';
      lines.push(
        [row.moscowDate, formatMoscowWeekdayLongRu(row.moscowDate), presenter]
          .map((c) => csvEscape(String(c)))
          .join(','),
      );
    }
    const body = `\uFEFF${lines.join('\n')}\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lk-daily-upcoming.csv"');
    res.send(body);
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
  assertTeamAccess(req.auth, teamId);
  try {
    const out = await recordPresentation(teamId, 'presented');
    res.json(out);
  } catch (e) {
    throwPresentationHttpError(e);
  }
}

export async function skip(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  assertTeamAccess(req.auth, teamId);
  const { error, value } = skipBody.validate(req.body ?? {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new HttpError(400, error.message);
  }
  try {
    const out = await recordPresentation(teamId, 'skipped', new Date(), {
      rotateQueue: value.rotate !== false,
    });
    res.json(out);
  } catch (e) {
    throwPresentationHttpError(e);
  }
}

export async function putOrder(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid or missing teamId');
  }
  assertTeamAccess(req.auth, teamId);
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
  assertTeamAccess(req.auth, teamId);
  const userIds = await sortQueueAlphabetically(new mongoose.Types.ObjectId(teamId));
  res.json({ ok: true, userIds });
}
