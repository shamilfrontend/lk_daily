import { addDays } from 'date-fns';
import type { ClientSession, Types } from 'mongoose';
import mongoose from 'mongoose';

import { PresentationLog } from '../models/PresentationLog.js';
import { QueueDaySubstitution } from '../models/QueueDaySubstitution.js';
import { QueueOrder } from '../models/QueueOrder.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { Vacation } from '../models/Vacation.js';
import {
  getMoscowDateString,
  moscowDateStringToUtc,
  nextMoscowDateString,
} from '../utils/dateHelpers.js';
import {
  explainWhyNonWorking,
  getWorkingDayCheckerForYear,
  isWorkingDay,
} from './calendarService.js';

/** Транзакции Mongoose требуют replica set или mongos; локальный одиночный mongod падает с этой ошибкой. */
let cachedTransactionsSupported: boolean | undefined;

async function isMongoTransactionsSupported(): Promise<boolean> {
  if (cachedTransactionsSupported !== undefined) {
    return cachedTransactionsSupported;
  }
  try {
    const { db } = mongoose.connection;
    if (!db) {
      cachedTransactionsSupported = false;
      return false;
    }
    const hello = (await db.admin().command({ hello: 1 })) as {
      setName?: string;
      msg?: string;
    };
    cachedTransactionsSupported =
      typeof hello.setName === 'string' || hello.msg === 'isdbgrid';
    return cachedTransactionsSupported;
  } catch {
    cachedTransactionsSupported = false;
    return false;
  }
}

function toOid(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export async function getVacationUserIdSetForMoscowDay(
  userIds: Types.ObjectId[],
  moscowDateStr: string,
  session?: ClientSession,
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
  })
    .session(session ?? null)
    .lean();

  return new Set(vacations.map((v) => v.userId.toString()));
}

export async function getMaternityUserIdSet(
  userIds: Types.ObjectId[],
  session?: ClientSession,
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const rows = await User.find({
    _id: { $in: userIds },
    onMaternityLeave: true,
  })
    .session(session ?? null)
    .select('_id')
    .lean();
  return new Set(rows.map((r) => r._id.toString()));
}

export async function findFirstPresenterId(
  orderedUserIds: Types.ObjectId[],
  unavailableSet: Set<string>,
): Promise<Types.ObjectId | null> {
  for (const uid of orderedUserIds) {
    if (!unavailableSet.has(uid.toString())) {
      return uid;
    }
  }
  return null;
}

function rotatePresenter(
  queue: Types.ObjectId[],
  presenterId: Types.ObjectId,
): Types.ObjectId[] {
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
  | { kind: 'non_working'; reason: string }
  | { kind: 'no_queue' }
  | { kind: 'no_available' }
  | {
      kind: 'ok';
      /** Кто отображается и попадает в лог выступления */
      userId: Types.ObjectId;
      user: { _id: string; fullName: string };
      /** Кого сдвигаем в конце очереди при «Выступил» / «Пропустить» */
      rotationUserId: Types.ObjectId;
      /** Если задана подмена на день: канонический следующий по очереди */
      substitution?: { canonicalUserId: string; canonicalFullName: string };
    };

export async function getCurrentPresenter(
  teamId: string,
  when: Date = new Date(),
): Promise<CurrentPresenterResult> {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }

  const moscowDateStr = getMoscowDateString(when);
  const working = await isWorkingDay(moscowDateStr, team.region);
  if (!working) {
    const reason = await explainWhyNonWorking(moscowDateStr, team.region);
    return { kind: 'non_working', reason };
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
  const orderedActive = queueOrder.userIds.filter((id) =>
    userById.has(id.toString()),
  );

  const vacationSet = await getVacationUserIdSetForMoscowDay(
    orderedActive,
    moscowDateStr,
  );
  const maternitySet = await getMaternityUserIdSet(orderedActive);
  const unavailable = new Set<string>([...vacationSet, ...maternitySet]);
  const presenterId = await findFirstPresenterId(orderedActive, unavailable);

  if (!presenterId) {
    return { kind: 'no_available' };
  }

  const canonicalUser = userById.get(presenterId.toString());
  if (!canonicalUser) {
    return { kind: 'no_available' };
  }

  const subDoc = await QueueDaySubstitution.findOne({
    teamId: team._id,
    moscowDate: moscowDateStr,
  }).lean();

  if (subDoc) {
    const subUser = await User.findOne({
      _id: subDoc.substituteUserId,
      teamId: team._id,
      isActive: true,
    }).lean();
    if (subUser) {
      return {
        kind: 'ok',
        userId: subUser._id,
        user: { _id: subUser._id.toString(), fullName: subUser.fullName },
        rotationUserId: presenterId,
        substitution: {
          canonicalUserId: canonicalUser._id.toString(),
          canonicalFullName: canonicalUser.fullName,
        },
      };
    }
  }

  return {
    kind: 'ok',
    userId: presenterId,
    user: {
      _id: canonicalUser._id.toString(),
      fullName: canonicalUser.fullName,
    },
    rotationUserId: presenterId,
  };
}

export async function getQueueState(teamId: string) {
  const queueOrder = await QueueOrder.findOne({ teamId: toOid(teamId) }).lean();
  if (!queueOrder) {
    return { userIds: [] as string[] };
  }
  return { userIds: queueOrder.userIds.map((id) => id.toString()) };
}

export async function presentationLogExistsForTeamMoscowDay(
  teamId: string,
  moscowDateStr: string,
  session?: ClientSession,
): Promise<boolean> {
  const dayStart = moscowDateStringToUtc(moscowDateStr);
  const dayEndExclusive = moscowDateStringToUtc(
    nextMoscowDateString(moscowDateStr),
  );
  const exists = await PresentationLog.exists({
    teamId: toOid(teamId),
    date: { $gte: dayStart, $lt: dayEndExclusive },
  }).session(session ?? null);
  return Boolean(exists);
}

export async function assertNoLogForTeamDay(
  teamId: string,
  moscowDateStr: string,
  session?: ClientSession,
): Promise<void> {
  const exists = await presentationLogExistsForTeamMoscowDay(
    teamId,
    moscowDateStr,
    session,
  );
  if (exists) {
    throw new Error('ALREADY_RECORDED_TODAY');
  }
}

export async function getQueueInsightsForToday(
  teamId: string,
  when: Date = new Date(),
): Promise<{ vacationUserIds: string[]; maternityUserIds: string[] }> {
  const team = await Team.findById(teamId).lean();
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }
  const queueOrder = await QueueOrder.findOne({ teamId: toOid(teamId) }).lean();
  if (!queueOrder || queueOrder.userIds.length === 0) {
    return { vacationUserIds: [], maternityUserIds: [] };
  }
  const users = await User.find({
    _id: { $in: queueOrder.userIds },
    teamId: team._id,
    isActive: true,
  }).lean();
  const activeIdSet = new Set(users.map((u) => u._id.toString()));
  const orderedActive = queueOrder.userIds.filter((id) =>
    activeIdSet.has(id.toString()),
  );
  const moscowDateStr = getMoscowDateString(when);
  const vacationSet = await getVacationUserIdSetForMoscowDay(
    orderedActive,
    moscowDateStr,
  );
  const maternitySet = await getMaternityUserIdSet(orderedActive);
  return {
    vacationUserIds: [...vacationSet],
    maternityUserIds: [...maternitySet],
  };
}

/** Одна строка прогноза для календарной даты Москвы (рабочий день или null presenter). */
export async function getPresenterRowForMoscowDate(
  teamId: string,
  moscowDateStr: string,
): Promise<UpcomingRow | null> {
  const when = moscowDateStringToUtc(moscowDateStr);
  const rows = await getUpcomingPresenters(teamId, 400, when);
  return rows.find((r) => r.moscowDate === moscowDateStr) ?? null;
}

/** Поменять подмены между двумя датами: на каждой дате показывается докладчик с другой даты. */
export async function swapSubstitutionDays(
  teamId: string,
  moscowDateA: string,
  moscowDateB: string,
): Promise<void> {
  if (moscowDateA === moscowDateB) {
    return;
  }
  const rowA = await getPresenterRowForMoscowDate(teamId, moscowDateA);
  const rowB = await getPresenterRowForMoscowDate(teamId, moscowDateB);
  const presA = rowA?.presenter ?? null;
  const presB = rowB?.presenter ?? null;
  if (!presA || !presB) {
    throw new Error('SWAP_NO_PRESENTER');
  }
  if (presA._id === presB._id) {
    return;
  }
  const tid = toOid(teamId);
  const baseOpts = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  } as const;
  const writePair = async (session: ClientSession | null) => {
    const sessionOpt = session ? { ...baseOpts, session } : { ...baseOpts };
    await QueueDaySubstitution.findOneAndUpdate(
      { teamId: tid, moscowDate: moscowDateA },
      { $set: { substituteUserId: new mongoose.Types.ObjectId(presB._id) } },
      sessionOpt,
    );
    await QueueDaySubstitution.findOneAndUpdate(
      { teamId: tid, moscowDate: moscowDateB },
      { $set: { substituteUserId: new mongoose.Types.ObjectId(presA._id) } },
      sessionOpt,
    );
  };
  if (!(await isMongoTransactionsSupported())) {
    await writePair(null);
    return;
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => writePair(session));
  } finally {
    await session.endSession();
  }
}

async function recordPresentationCore(
  teamId: string,
  status: 'presented' | 'skipped',
  when: Date,
  rotateQueue: boolean,
  session: ClientSession | null,
): Promise<string[]> {
  const team = await (session
    ? Team.findById(teamId).session(session).lean()
    : Team.findById(teamId).lean());
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }
  const moscowDateStr = getMoscowDateString(when);
  const working = await isWorkingDay(moscowDateStr, team.region);
  if (!working) {
    throw new Error('NON_WORKING_DAY');
  }

  await assertNoLogForTeamDay(teamId, moscowDateStr, session ?? undefined);

  const queueOrder = await (session
    ? QueueOrder.findOne({ teamId: toOid(teamId) }).session(session)
    : QueueOrder.findOne({ teamId: toOid(teamId) }));
  if (!queueOrder || queueOrder.userIds.length === 0) {
    throw new Error('NO_QUEUE');
  }

  const users = await (session
    ? User.find({
        _id: { $in: queueOrder.userIds },
        teamId: team._id,
        isActive: true,
      })
        .session(session)
        .lean()
    : User.find({
        _id: { $in: queueOrder.userIds },
        teamId: team._id,
        isActive: true,
      }).lean());
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const orderedActive = queueOrder.userIds.filter((id) =>
    userById.has(id.toString()),
  );
  if (orderedActive.length === 0) {
    throw new Error('NO_PRESENTER');
  }

  const vacationSet = await getVacationUserIdSetForMoscowDay(
    orderedActive,
    moscowDateStr,
    session ?? undefined,
  );
  const maternitySet = await getMaternityUserIdSet(
    orderedActive,
    session ?? undefined,
  );
  const unavailable = new Set<string>([...vacationSet, ...maternitySet]);
  const canonicalPresenterId = await findFirstPresenterId(
    orderedActive,
    unavailable,
  );
  if (!canonicalPresenterId) {
    throw new Error('NO_PRESENTER');
  }

  let presentedUserId: Types.ObjectId = canonicalPresenterId;
  const substitutionDoc = await (session
    ? QueueDaySubstitution.findOne({
        teamId: team._id,
        moscowDate: moscowDateStr,
      })
        .session(session)
        .lean()
    : QueueDaySubstitution.findOne({
        teamId: team._id,
        moscowDate: moscowDateStr,
      }).lean());
  if (substitutionDoc) {
    const substitutionUser = await (session
      ? User.findOne({
          _id: substitutionDoc.substituteUserId,
          teamId: team._id,
          isActive: true,
        })
          .session(session)
          .lean()
      : User.findOne({
          _id: substitutionDoc.substituteUserId,
          teamId: team._id,
          isActive: true,
        }).lean());
    if (substitutionUser) {
      presentedUserId = substitutionUser._id;
    }
  }

  const newOrder = rotateQueue
    ? rotatePresenter(queueOrder.userIds, canonicalPresenterId)
    : [...queueOrder.userIds];
  if (rotateQueue) {
    queueOrder.userIds = newOrder;
    await queueOrder.save(session ? { session } : {});
  }

  const createOpts = session ? { session } : {};
  await PresentationLog.create(
    [
      {
        teamId: toOid(teamId),
        date: moscowDateStringToUtc(moscowDateStr),
        userId: presentedUserId,
        status,
        rotationSkipped: !rotateQueue,
      },
    ],
    createOpts,
  );

  return newOrder.map((id) => id.toString());
}

export async function recordPresentation(
  teamId: string,
  status: 'presented' | 'skipped',
  when: Date = new Date(),
  options?: { rotateQueue?: boolean },
): Promise<{ newUserIds: string[] }> {
  const rotateQueue = options?.rotateQueue !== false;
  if (!(await isMongoTransactionsSupported())) {
    const newUserIds = await recordPresentationCore(
      teamId,
      status,
      when,
      rotateQueue,
      null,
    );
    return { newUserIds };
  }
  const session = await mongoose.startSession();
  try {
    let newUserIds: string[] = [];
    await session.withTransaction(async () => {
      newUserIds = await recordPresentationCore(
        teamId,
        status,
        when,
        rotateQueue,
        session,
      );
    });
    return { newUserIds };
  } finally {
    await session.endSession();
  }
}

export type UpcomingRow = {
  moscowDate: string;
  presenter: { _id: string; fullName: string } | null;
  /** Подмена на этот день: кто был бы без подстановки */
  substitution?: { canonicalFullName: string };
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

  const teamUsers = await User.find({
    teamId: team._id,
    isActive: true,
  }).lean();
  const userById = new Map(teamUsers.map((u) => [u._id.toString(), u]));
  const maternityTeamIds = await getMaternityUserIdSet(
    teamUsers.map((u) => u._id),
  );
  const checkerByYear = new Map<number, (dateStr: string) => boolean>();
  const substitutionDocs = await QueueDaySubstitution.find({
    teamId: team._id,
  }).lean();
  const substitutionByMoscowDate = new Map(
    substitutionDocs.map((s) => [s.moscowDate, s]),
  );

  let cursor = getMoscowDateString(when);
  const maxCalendarScan = 800;

  for (
    let i = 0;
    i < maxCalendarScan && rows.length < workingDaysLimit;
    i += 1
  ) {
    const year = Number(cursor.slice(0, 4));
    let checker = checkerByYear.get(year);
    if (!checker) {
      checker = await getWorkingDayCheckerForYear(year, team.region);
      checkerByYear.set(year, checker);
    }
    const working = checker(cursor);
    if (!working) {
      cursor = getMoscowDateString(addDays(moscowDateStringToUtc(cursor), 1));
      continue;
    }

    const activeSim = sim.filter((id) => userById.has(id.toString()));
    const vacationSet = await getVacationUserIdSetForMoscowDay(
      activeSim,
      cursor,
    );
    const unavailable = new Set<string>(vacationSet);
    for (const oid of activeSim) {
      if (maternityTeamIds.has(oid.toString())) {
        unavailable.add(oid.toString());
      }
    }
    const presenterId = await findFirstPresenterId(activeSim, unavailable);

    if (!presenterId) {
      rows.push({ moscowDate: cursor, presenter: null });
    } else {
      const u = userById.get(presenterId.toString());
      const subRow = substitutionByMoscowDate.get(cursor);
      let presenterOut: { _id: string; fullName: string } | null = u
        ? { _id: u._id.toString(), fullName: u.fullName }
        : null;
      let substitution: { canonicalFullName: string } | undefined;
      if (subRow && u) {
        const subU = userById.get(subRow.substituteUserId.toString());
        if (subU) {
          presenterOut = { _id: subU._id.toString(), fullName: subU.fullName };
          substitution = { canonicalFullName: u.fullName };
        }
      }
      rows.push({
        moscowDate: cursor,
        presenter: presenterOut,
        ...(substitution ? { substitution } : {}),
      });
      sim = rotatePresenter(activeSim, presenterId);
    }

    cursor = getMoscowDateString(addDays(moscowDateStringToUtc(cursor), 1));
  }

  return rows;
}

export async function ensureQueueOrder(teamId: Types.ObjectId): Promise<void> {
  await QueueOrder.updateOne(
    { teamId },
    { $setOnInsert: { teamId, userIds: [] } },
    { upsert: true },
  );
}

export async function appendUserToQueueEnd(
  teamId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<void> {
  await ensureQueueOrder(teamId);
  await QueueOrder.updateOne({ teamId }, { $addToSet: { userIds: userId } });
  // $addToSet не гарантирует порядок «в конец» — добиваем переносом в конец если уже был
  const q = await QueueOrder.findOne({ teamId });
  if (!q) return;
  const without = q.userIds.filter((id) => !id.equals(userId));
  without.push(userId);
  q.userIds = without;
  await q.save();
}

export async function removeUserFromQueue(
  teamId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<void> {
  await QueueOrder.updateOne({ teamId }, { $pull: { userIds: userId } });
}

export async function replaceQueueOrder(
  teamId: Types.ObjectId,
  userIds: Types.ObjectId[],
): Promise<void> {
  await QueueOrder.findOneAndUpdate(
    { teamId },
    { $set: { userIds } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function sortQueueAlphabetically(
  teamId: Types.ObjectId,
): Promise<string[]> {
  const team = await Team.findById(teamId).select('_id').lean();
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }
  const users = await User.find({ teamId, isActive: true })
    .sort({ fullName: 1 })
    .lean();
  const ids = users.map((u) => u._id);
  await replaceQueueOrder(teamId, ids);
  return ids.map((id) => id.toString());
}
