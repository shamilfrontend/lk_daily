import { addDays } from 'date-fns';
import type { Types } from 'mongoose';
import mongoose from 'mongoose';
import { PresentationLog } from '../models/PresentationLog.js';
import { QueueOrder } from '../models/QueueOrder.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { Vacation } from '../models/Vacation.js';
import { getMoscowDateString, moscowDateStringToUtc } from '../utils/dateHelpers.js';
import { isWorkingDay } from './calendarService.js';

function toOid(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export async function getVacationUserIdSetForMoscowDay(
  userIds: Types.ObjectId[],
  moscowDateStr: string,
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const dayStart = moscowDateStringToUtc(moscowDateStr);
  const dayEnd = moscowDateStringToUtc(moscowDateStr);
  // включительно: startDate <= day <= endDate
  const vacations = await Vacation.find({
    userId: { $in: userIds },
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  }).lean();

  return new Set(vacations.map((v) => v.userId.toString()));
}

export async function findFirstPresenterId(
  orderedUserIds: Types.ObjectId[],
  vacationSet: Set<string>,
): Promise<Types.ObjectId | null> {
  for (const uid of orderedUserIds) {
    if (!vacationSet.has(uid.toString())) {
      return uid;
    }
  }
  return null;
}

function rotatePresenter(queue: Types.ObjectId[], presenterId: Types.ObjectId): Types.ObjectId[] {
  const idx = queue.findIndex((id) => id.equals(presenterId));
  if (idx === -1) {
    return [...queue];
  }
  const next = [...queue];
  const [p] = next.splice(idx, 1);
  next.push(p);
  return next;
}

export type CurrentPresenterResult =
  | { kind: 'non_working' }
  | { kind: 'no_queue' }
  | { kind: 'no_available' }
  | { kind: 'ok'; userId: Types.ObjectId; user: { _id: string; fullName: string; email?: string } };

export async function getCurrentPresenter(teamId: string, when: Date = new Date()): Promise<CurrentPresenterResult> {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }

  const moscowDateStr = getMoscowDateString(when);
  const working = await isWorkingDay(moscowDateStr);
  if (!working) {
    return { kind: 'non_working' };
  }

  const queueOrder = await QueueOrder.findOne({ teamId: toOid(teamId) });
  if (!queueOrder || queueOrder.userIds.length === 0) {
    return { kind: 'no_queue' };
  }

  const users = await User.find({
    _id: { $in: queueOrder.userIds },
    teamId: team._id,
    isActive: true,
  }).lean();

  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const orderedActive = queueOrder.userIds.filter((id) => userById.has(id.toString()));

  const vacationSet = await getVacationUserIdSetForMoscowDay(orderedActive, moscowDateStr);
  const presenterId = await findFirstPresenterId(orderedActive, vacationSet);

  if (!presenterId) {
    return { kind: 'no_available' };
  }

  const u = userById.get(presenterId.toString());
  if (!u) {
    return { kind: 'no_available' };
  }

  return {
    kind: 'ok',
    userId: presenterId,
    user: { _id: u._id.toString(), fullName: u.fullName, email: u.email },
  };
}

export async function getQueueState(teamId: string) {
  const queueOrder = await QueueOrder.findOne({ teamId: toOid(teamId) }).lean();
  if (!queueOrder) {
    return { userIds: [] as string[] };
  }
  return { userIds: queueOrder.userIds.map((id) => id.toString()) };
}

export async function assertNoLogForTeamDay(teamId: string, moscowDateStr: string): Promise<void> {
  const dayStart = moscowDateStringToUtc(moscowDateStr);
  const exists = await PresentationLog.exists({ teamId: toOid(teamId), date: dayStart });
  if (exists) {
    throw new Error('ALREADY_RECORDED_TODAY');
  }
}

export async function recordPresentation(
  teamId: string,
  status: 'presented' | 'skipped',
  when: Date = new Date(),
): Promise<{ newUserIds: string[] }> {
  const moscowDateStr = getMoscowDateString(when);
  const working = await isWorkingDay(moscowDateStr);
  if (!working) {
    throw new Error('NON_WORKING_DAY');
  }

  await assertNoLogForTeamDay(teamId, moscowDateStr);

  const current = await getCurrentPresenter(teamId, when);
  if (current.kind !== 'ok') {
    throw new Error('NO_PRESENTER');
  }

  const queueOrder = await QueueOrder.findOne({ teamId: toOid(teamId) });
  if (!queueOrder) {
    throw new Error('NO_QUEUE');
  }

  const newOrder = rotatePresenter(queueOrder.userIds, current.userId);
  queueOrder.userIds = newOrder;
  await queueOrder.save();

  await PresentationLog.create({
    teamId: toOid(teamId),
    date: moscowDateStringToUtc(moscowDateStr),
    userId: current.userId,
    status,
  });

  return { newUserIds: newOrder.map((id) => id.toString()) };
}

export type UpcomingRow = {
  moscowDate: string;
  presenter: { _id: string; fullName: string } | null;
};

/** Следующие `workingDaysLimit` рабочих дней (по производственному календарю MVP), начиная с `when`. */
export async function getUpcomingPresenters(
  teamId: string,
  workingDaysLimit: number,
  when: Date = new Date(),
): Promise<UpcomingRow[]> {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }

  const queueOrder = await QueueOrder.findOne({ teamId: toOid(teamId) }).lean();
  if (!queueOrder) {
    return [];
  }

  let sim = [...queueOrder.userIds];
  const rows: UpcomingRow[] = [];

  const teamUsers = await User.find({ teamId: team._id, isActive: true }).lean();
  const userById = new Map(teamUsers.map((u) => [u._id.toString(), u]));

  let cursor = getMoscowDateString(when);
  const maxCalendarScan = 800;

  for (let i = 0; i < maxCalendarScan && rows.length < workingDaysLimit; i += 1) {
    const working = await isWorkingDay(cursor);
    if (!working) {
      cursor = getMoscowDateString(addDays(moscowDateStringToUtc(cursor), 1));
      continue;
    }

    const activeSim = sim.filter((id) => userById.has(id.toString()));
    const vacationSet = await getVacationUserIdSetForMoscowDay(activeSim, cursor);
    const presenterId = await findFirstPresenterId(activeSim, vacationSet);

    if (!presenterId) {
      rows.push({ moscowDate: cursor, presenter: null });
    } else {
      const u = userById.get(presenterId.toString());
      rows.push({
        moscowDate: cursor,
        presenter: u ? { _id: u._id.toString(), fullName: u.fullName } : null,
      });
      sim = rotatePresenter(activeSim, presenterId);
    }

    cursor = getMoscowDateString(addDays(moscowDateStringToUtc(cursor), 1));
  }

  return rows;
}

export async function ensureQueueOrder(teamId: Types.ObjectId): Promise<void> {
  await QueueOrder.updateOne({ teamId }, { $setOnInsert: { teamId, userIds: [] } }, { upsert: true });
}

export async function appendUserToQueueEnd(teamId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
  await ensureQueueOrder(teamId);
  await QueueOrder.updateOne(
    { teamId },
    { $addToSet: { userIds: userId } },
  );
  // $addToSet не гарантирует порядок «в конец» — добиваем переносом в конец если уже был
  const q = await QueueOrder.findOne({ teamId });
  if (!q) return;
  const without = q.userIds.filter((id) => !id.equals(userId));
  without.push(userId);
  q.userIds = without;
  await q.save();
}

export async function removeUserFromQueue(teamId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
  await QueueOrder.updateOne({ teamId }, { $pull: { userIds: userId } });
}

export async function replaceQueueOrder(teamId: Types.ObjectId, userIds: Types.ObjectId[]): Promise<void> {
  await QueueOrder.findOneAndUpdate(
    { teamId },
    { teamId, userIds },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function sortQueueAlphabetically(teamId: Types.ObjectId): Promise<string[]> {
  const users = await User.find({ teamId, isActive: true }).sort({ fullName: 1 }).lean();
  const ids = users.map((u) => u._id);
  await replaceQueueOrder(teamId, ids);
  return ids.map((id) => id.toString());
}
