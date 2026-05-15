import { addDays } from 'date-fns';
import type { ClientSession, Types } from 'mongoose';
import mongoose from 'mongoose';

import { PresentationLog } from '../models/PresentationLog.js';
import { QueueDaySubstitution } from '../models/QueueDaySubstitution.js';
import { QueueOrder } from '../models/QueueOrder.js';
import type { IQueueMember } from '../models/QueueOrder.js';
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

export type QueueMemberPlain = {
  userId: Types.ObjectId;
  active: boolean;
  skipDebt: number;
};

type QueueOrderLean = {
  userIds?: Types.ObjectId[];
  members?: {
    userId: Types.ObjectId;
    active?: boolean;
    skipDebt?: number;
  }[];
};

export function normalizeQueueMember(m: {
  userId: Types.ObjectId;
  active?: boolean;
  skipDebt?: number;
}): QueueMemberPlain {
  const debt =
    typeof m.skipDebt === 'number' && m.skipDebt > 0
      ? Math.floor(m.skipDebt)
      : 0;
  return {
    userId: m.userId,
    active: m.active !== false,
    skipDebt: debt,
  };
}

/** Читает members из документа (в т.ч. ленивая форма со старым полем userIds). */
export function membersFromLeanDoc(doc: QueueOrderLean | null): QueueMemberPlain[] {
  if (!doc) {
    return [];
  }
  if (doc.members && doc.members.length > 0) {
    return doc.members.map((m) => normalizeQueueMember(m));
  }
  if (doc.userIds && doc.userIds.length > 0) {
    return doc.userIds.map((userId) =>
      normalizeQueueMember({ userId, active: true }),
    );
  }
  return [];
}

/** Миграция legacy `userIds` → `members`, очистка поля userIds. */
export async function migrateLegacyQueueOrderIfNeeded(
  teamId: Types.ObjectId,
): Promise<void> {
  const doc = (await QueueOrder.findOne({ teamId }).lean()) as QueueOrderLean | null;
  if (!doc) {
    return;
  }
  if (doc.userIds === undefined) {
    return;
  }

  let nextMembers = membersFromLeanDoc(doc);
  if (nextMembers.length === 0) {
    nextMembers = [];
  }

  await QueueOrder.updateOne(
    { teamId },
    { $set: { members: nextMembers }, $unset: { userIds: 1 } },
  );
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

export async function getSickLeaveUserIdSet(
  userIds: Types.ObjectId[],
  session?: ClientSession,
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const rows = await User.find({
    _id: { $in: userIds },
    onSickLeave: true,
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

/** Первый доступный участник в порядке очереди (без учёта skipDebt). */
export function resolveCanonicalByQueueOrder(
  members: QueueMemberPlain[],
  activeUserIdSet: Set<string>,
  unavailable: Set<string>,
): Types.ObjectId | null {
  for (const m of members) {
    if (!m.active) {
      continue;
    }
    const id = m.userId.toString();
    if (!activeUserIdSet.has(id) || unavailable.has(id)) {
      continue;
    }
    return m.userId;
  }
  return null;
}

/** Канонический докладчик: сначала с макс. skipDebt, иначе первый доступный по очереди. */
export function resolveCanonicalPresenterId(
  members: QueueMemberPlain[],
  activeUserIdSet: Set<string>,
  unavailable: Set<string>,
): Types.ObjectId | null {
  const candidates: {
    userId: Types.ObjectId;
    index: number;
    skipDebt: number;
  }[] = [];

  members.forEach((m, index) => {
    if (!m.active) {
      return;
    }
    const id = m.userId.toString();
    if (!activeUserIdSet.has(id) || unavailable.has(id)) {
      return;
    }
    candidates.push({
      userId: m.userId,
      index,
      skipDebt: m.skipDebt,
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  const withDebt = candidates.filter((c) => c.skipDebt > 0);
  if (withDebt.length > 0) {
    withDebt.sort((a, b) => {
      if (b.skipDebt !== a.skipDebt) {
        return b.skipDebt - a.skipDebt;
      }
      return a.index - b.index;
    });
    return withDebt[0]!.userId;
  }

  return candidates[0]!.userId;
}

type SubstitutionLean = {
  canonicalUserId?: Types.ObjectId;
  substituteUserId: Types.ObjectId;
};

function substitutionAppliesToCanonical(
  sub: SubstitutionLean,
  canonicalId: Types.ObjectId,
): boolean {
  if (!sub.canonicalUserId) {
    return true;
  }
  return sub.canonicalUserId.equals(canonicalId);
}

type UserLean = { _id: Types.ObjectId; fullName: string };

function buildPresenterOkResult(
  canonicalId: Types.ObjectId,
  canonicalUser: UserLean,
  members: QueueMemberPlain[],
  subDoc: SubstitutionLean | null,
  substituteUser: UserLean | null,
): Extract<CurrentPresenterResult, { kind: 'ok' }> {
  const canonicalSkipDebt =
    members.find((m) => m.userId.equals(canonicalId))?.skipDebt ?? 0;

  if (
    subDoc &&
    substituteUser &&
    substitutionAppliesToCanonical(subDoc, canonicalId)
  ) {
    return {
      kind: 'ok',
      userId: substituteUser._id,
      user: {
        _id: substituteUser._id.toString(),
        fullName: substituteUser.fullName,
      },
      rotationUserId: canonicalId,
      canonicalSkipDebt,
      substitution: {
        canonicalUserId: canonicalUser._id.toString(),
        canonicalFullName: canonicalUser.fullName,
      },
    };
  }

  return {
    kind: 'ok',
    userId: canonicalId,
    user: {
      _id: canonicalUser._id.toString(),
      fullName: canonicalUser.fullName,
    },
    rotationUserId: canonicalId,
    canonicalSkipDebt,
  };
}

async function loadQueueContextForTeamDay(
  teamId: string,
  moscowDateStr: string,
  session: ClientSession | null,
): Promise<{
  team: { _id: Types.ObjectId; region?: string };
  membersOrdered: QueueMemberPlain[];
  userById: Map<string, UserLean>;
  unavailable: Set<string>;
} | null> {
  const team = await (session
    ? Team.findById(teamId).session(session).lean()
    : Team.findById(teamId).lean());
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }

  const tid = toOid(teamId);
  await migrateLegacyQueueOrderIfNeeded(tid);

  const queueOrder = await (session
    ? QueueOrder.findOne({ teamId: tid }).session(session)
    : QueueOrder.findOne({ teamId: tid }));
  if (!queueOrder || queueOrder.members.length === 0) {
    return null;
  }

  const membersOrdered = queueOrder.members.map((m) => normalizeQueueMember(m));

  const users = await (session
    ? User.find({
        _id: { $in: membersOrdered.map((x) => x.userId) },
        teamId: team._id,
        isActive: true,
      })
        .session(session)
        .lean()
    : User.find({
        _id: { $in: membersOrdered.map((x) => x.userId) },
        teamId: team._id,
        isActive: true,
      }).lean());
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const activeUserIdSet = new Set(userById.keys());
  const orderedForRotation = membersOrdered
    .filter((m) => m.active && activeUserIdSet.has(m.userId.toString()))
    .map((m) => m.userId);

  const vacationSet = await getVacationUserIdSetForMoscowDay(
    orderedForRotation,
    moscowDateStr,
    session ?? undefined,
  );
  const maternitySet = await getMaternityUserIdSet(
    orderedForRotation,
    session ?? undefined,
  );
  const sickLeaveSet = await getSickLeaveUserIdSet(
    orderedForRotation,
    session ?? undefined,
  );
  const unavailable = new Set<string>([
    ...vacationSet,
    ...maternitySet,
    ...sickLeaveSet,
  ]);

  return { team, membersOrdered, userById, unavailable };
}

/** Сдвигает участника в конец полного списка members (сохраняет active и skipDebt). */
function rotateMemberRow(
  members: QueueMemberPlain[],
  presenterUserId: Types.ObjectId,
): QueueMemberPlain[] {
  const idx = members.findIndex((m) => m.userId.equals(presenterUserId));
  if (idx === -1) {
    return [...members];
  }
  const next = [...members];
  const [row] = next.splice(idx, 1);
  next.push(row);
  return next;
}

function clearSkipDebtForUser(
  members: QueueMemberPlain[],
  userId: Types.ObjectId,
): QueueMemberPlain[] {
  return members.map((m) =>
    m.userId.equals(userId) ? { ...m, skipDebt: 0 } : m,
  );
}

function incrementSkipDebtForUser(
  members: QueueMemberPlain[],
  userId: Types.ObjectId,
): QueueMemberPlain[] {
  return members.map((m) =>
    m.userId.equals(userId) ? { ...m, skipDebt: m.skipDebt + 1 } : m,
  );
}

function toIQueueMembers(members: QueueMemberPlain[]): IQueueMember[] {
  return members.map((m) => ({
    userId: m.userId,
    active: m.active,
    skipDebt: m.skipDebt,
  }));
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
      /** Кого сдвигаем в конец очереди при «Выступил» */
      rotationUserId: Types.ObjectId;
      /** Долг пропусков канонического докладчика */
      canonicalSkipDebt: number;
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

  const ctx = await loadQueueContextForTeamDay(teamId, moscowDateStr, null);
  if (!ctx) {
    return { kind: 'no_queue' };
  }

  const activeUserIdSet = new Set(ctx.userById.keys());
  const canonicalId = resolveCanonicalByQueueOrder(
    ctx.membersOrdered,
    activeUserIdSet,
    ctx.unavailable,
  );
  if (!canonicalId) {
    return { kind: 'no_available' };
  }

  const canonicalUser = ctx.userById.get(canonicalId.toString());
  if (!canonicalUser) {
    return { kind: 'no_available' };
  }

  const subDoc = await QueueDaySubstitution.findOne({
    teamId: team._id,
    moscowDate: moscowDateStr,
  }).lean();

  let substituteUser: UserLean | null = null;
  if (subDoc) {
    const sub = await User.findOne({
      _id: subDoc.substituteUserId,
      teamId: team._id,
      isActive: true,
    }).lean();
    substituteUser = sub;
  }

  return buildPresenterOkResult(
    canonicalId,
    canonicalUser,
    ctx.membersOrdered,
    subDoc,
    substituteUser,
  );
}

/** Канонический докладчик на московскую дату (для подмен и прогноза). */
export async function resolveCanonicalForTeamMoscowDate(
  teamId: string,
  moscowDateStr: string,
): Promise<Types.ObjectId | null> {
  const ctx = await loadQueueContextForTeamDay(teamId, moscowDateStr, null);
  if (!ctx) {
    return null;
  }
  return resolveCanonicalByQueueOrder(
    ctx.membersOrdered,
    new Set(ctx.userById.keys()),
    ctx.unavailable,
  );
}

export async function getQueueState(teamId: string) {
  const tid = toOid(teamId);
  await migrateLegacyQueueOrderIfNeeded(tid);
  const queueOrder = await QueueOrder.findOne({ teamId: tid }).lean();
  if (!queueOrder) {
    return { members: [] as { userId: string; active: boolean }[] };
  }
  const rows = membersFromLeanDoc(queueOrder as QueueOrderLean);
  return {
    members: rows.map((m) => ({
      userId: m.userId.toString(),
      active: m.active,
      skipDebt: m.skipDebt,
    })),
  };
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
): Promise<{
  vacationUserIds: string[];
  maternityUserIds: string[];
  sickLeaveUserIds: string[];
}> {
  const team = await Team.findById(teamId).lean();
  if (!team) {
    throw new Error('TEAM_NOT_FOUND');
  }
  const tid = toOid(teamId);
  await migrateLegacyQueueOrderIfNeeded(tid);
  const queueOrder = await QueueOrder.findOne({ teamId: tid }).lean();
  const membersOrdered = membersFromLeanDoc(queueOrder as QueueOrderLean | null);
  if (!queueOrder || membersOrdered.length === 0) {
    return { vacationUserIds: [], maternityUserIds: [], sickLeaveUserIds: [] };
  }
  const memberIds = membersOrdered.map((m) => m.userId);
  const users = await User.find({
    _id: { $in: memberIds },
    teamId: team._id,
    isActive: true,
  }).lean();
  const activeIdSet = new Set(users.map((u) => u._id.toString()));
  const orderedForInsights = membersOrdered
    .filter((m) => m.active && activeIdSet.has(m.userId.toString()))
    .map((m) => m.userId);
  const moscowDateStr = getMoscowDateString(when);
  const vacationSet = await getVacationUserIdSetForMoscowDay(
    orderedForInsights,
    moscowDateStr,
  );
  const maternitySet = await getMaternityUserIdSet(orderedForInsights);
  const sickLeaveSet = await getSickLeaveUserIdSet(orderedForInsights);
  return {
    vacationUserIds: [...vacationSet],
    maternityUserIds: [...maternitySet],
    sickLeaveUserIds: [...sickLeaveSet],
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
  const canonicalA = await resolveCanonicalForTeamMoscowDate(
    teamId,
    moscowDateA,
  );
  const canonicalB = await resolveCanonicalForTeamMoscowDate(
    teamId,
    moscowDateB,
  );
  if (!canonicalA || !canonicalB) {
    throw new Error('SWAP_NO_PRESENTER');
  }

  const writePair = async (session: ClientSession | null) => {
    const sessionOpt = session ? { ...baseOpts, session } : { ...baseOpts };
    await QueueDaySubstitution.findOneAndUpdate(
      { teamId: tid, moscowDate: moscowDateA },
      {
        $set: {
          canonicalUserId: canonicalA,
          substituteUserId: new mongoose.Types.ObjectId(presB._id),
        },
      },
      sessionOpt,
    );
    await QueueDaySubstitution.findOneAndUpdate(
      { teamId: tid, moscowDate: moscowDateB },
      {
        $set: {
          canonicalUserId: canonicalB,
          substituteUserId: new mongoose.Types.ObjectId(presA._id),
        },
      },
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
  when: Date,
  session: ClientSession | null,
): Promise<string[]> {
  const moscowDateStr = getMoscowDateString(when);
  const ctx = await loadQueueContextForTeamDay(teamId, moscowDateStr, session);
  if (!ctx) {
    throw new Error('NO_QUEUE');
  }

  const working = await isWorkingDay(moscowDateStr, ctx.team.region);
  if (!working) {
    throw new Error('NON_WORKING_DAY');
  }

  await assertNoLogForTeamDay(teamId, moscowDateStr, session ?? undefined);

  const activeUserIdSet = new Set(ctx.userById.keys());
  const canonicalPresenterId = resolveCanonicalByQueueOrder(
    ctx.membersOrdered,
    activeUserIdSet,
    ctx.unavailable,
  );
  if (!canonicalPresenterId) {
    throw new Error('NO_PRESENTER');
  }

  const canonicalUser = ctx.userById.get(canonicalPresenterId.toString());
  if (!canonicalUser) {
    throw new Error('NO_PRESENTER');
  }

  const substitutionDoc = await (session
    ? QueueDaySubstitution.findOne({
        teamId: ctx.team._id,
        moscowDate: moscowDateStr,
      })
        .session(session)
        .lean()
    : QueueDaySubstitution.findOne({
        teamId: ctx.team._id,
        moscowDate: moscowDateStr,
      }).lean());

  let presentedUserId: Types.ObjectId = canonicalPresenterId;
  if (
    substitutionDoc &&
    substitutionAppliesToCanonical(substitutionDoc, canonicalPresenterId)
  ) {
    const substitutionUser = await (session
      ? User.findOne({
          _id: substitutionDoc.substituteUserId,
          teamId: ctx.team._id,
          isActive: true,
        })
          .session(session)
          .lean()
      : User.findOne({
          _id: substitutionDoc.substituteUserId,
          teamId: ctx.team._id,
          isActive: true,
        }).lean());
    if (substitutionUser) {
      presentedUserId = substitutionUser._id;
    }
  }

  const tid = toOid(teamId);
  const queueOrder = await (session
    ? QueueOrder.findOne({ teamId: tid }).session(session)
    : QueueOrder.findOne({ teamId: tid }));
  if (!queueOrder) {
    throw new Error('NO_QUEUE');
  }

  let newMembers = rotateMemberRow(ctx.membersOrdered, canonicalPresenterId);
  newMembers = clearSkipDebtForUser(newMembers, canonicalPresenterId);
  queueOrder.members = toIQueueMembers(newMembers);
  await queueOrder.save(session ? { session } : {});

  const createOpts = session ? { session } : {};
  await PresentationLog.create(
    [
      {
        teamId: tid,
        date: moscowDateStringToUtc(moscowDateStr),
        userId: presentedUserId,
        status: 'presented',
      },
    ],
    createOpts,
  );

  return newMembers.map((m) => m.userId.toString());
}

export async function recordPresentation(
  teamId: string,
  when: Date = new Date(),
): Promise<{ newUserIds: string[] }> {
  await migrateLegacyQueueOrderIfNeeded(toOid(teamId));
  if (!(await isMongoTransactionsSupported())) {
    const newUserIds = await recordPresentationCore(teamId, when, null);
    return { newUserIds };
  }
  const session = await mongoose.startSession();
  try {
    let newUserIds: string[] = [];
    await session.withTransaction(async () => {
      newUserIds = await recordPresentationCore(teamId, when, session);
    });
    return { newUserIds };
  } finally {
    await session.endSession();
  }
}

async function skipCurrentPresenterCore(
  teamId: string,
  when: Date,
  session: ClientSession | null,
): Promise<string[]> {
  const moscowDateStr = getMoscowDateString(when);
  const ctx = await loadQueueContextForTeamDay(teamId, moscowDateStr, session);
  if (!ctx) {
    throw new Error('NO_QUEUE');
  }

  const working = await isWorkingDay(moscowDateStr, ctx.team.region);
  if (!working) {
    throw new Error('NON_WORKING_DAY');
  }

  const activeUserIdSet = new Set(ctx.userById.keys());
  const canonicalPresenterId = resolveCanonicalByQueueOrder(
    ctx.membersOrdered,
    activeUserIdSet,
    ctx.unavailable,
  );
  if (!canonicalPresenterId) {
    throw new Error('NO_PRESENTER');
  }

  const tid = toOid(teamId);
  const queueOrder = await (session
    ? QueueOrder.findOne({ teamId: tid }).session(session)
    : QueueOrder.findOne({ teamId: tid }));
  if (!queueOrder) {
    throw new Error('NO_QUEUE');
  }

  const rotated = rotateMemberRow(ctx.membersOrdered, canonicalPresenterId);
  const newMembers = incrementSkipDebtForUser(
    rotated,
    canonicalPresenterId,
  );
  queueOrder.members = toIQueueMembers(newMembers);
  await queueOrder.save(session ? { session } : {});

  return newMembers.map((m) => m.userId.toString());
}

/** Пропуск без записи в журнал: +skipDebt, следующий по правилам долга и очереди. */
export async function skipCurrentPresenter(
  teamId: string,
  when: Date = new Date(),
): Promise<{ newUserIds: string[] }> {
  await migrateLegacyQueueOrderIfNeeded(toOid(teamId));
  if (!(await isMongoTransactionsSupported())) {
    const newUserIds = await skipCurrentPresenterCore(teamId, when, null);
    return { newUserIds };
  }
  const session = await mongoose.startSession();
  try {
    let newUserIds: string[] = [];
    await session.withTransaction(async () => {
      newUserIds = await skipCurrentPresenterCore(teamId, when, session);
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

  const tid = toOid(teamId);
  await migrateLegacyQueueOrderIfNeeded(tid);
  const queueOrder = await QueueOrder.findOne({ teamId: tid }).lean();
  if (!queueOrder) {
    return [];
  }

  let simMembers = membersFromLeanDoc(queueOrder as QueueOrderLean);
  const rows: UpcomingRow[] = [];

  const teamUsers = await User.find({
    teamId: team._id,
    isActive: true,
  }).lean();
  const userById = new Map(teamUsers.map((u) => [u._id.toString(), u]));
  const maternityTeamIds = await getMaternityUserIdSet(
    teamUsers.map((u) => u._id),
  );
  const sickLeaveTeamIds = await getSickLeaveUserIdSet(
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

    const activeUserIdSet = new Set(userById.keys());
    const vacationSet = await getVacationUserIdSetForMoscowDay(
      simMembers.filter((m) => m.active).map((m) => m.userId),
      cursor,
    );
    const unavailable = new Set<string>(vacationSet);
    for (const id of activeUserIdSet) {
      if (maternityTeamIds.has(id) || sickLeaveTeamIds.has(id)) {
        unavailable.add(id);
      }
    }
    const presenterId = resolveCanonicalPresenterId(
      simMembers,
      activeUserIdSet,
      unavailable,
    );

    if (!presenterId) {
      rows.push({ moscowDate: cursor, presenter: null });
    } else {
      const u = userById.get(presenterId.toString());
      const subRow = substitutionByMoscowDate.get(cursor);
      let presenterOut: { _id: string; fullName: string } | null = u
        ? { _id: u._id.toString(), fullName: u.fullName }
        : null;
      let substitution: { canonicalFullName: string } | undefined;
      if (
        subRow &&
        u &&
        substitutionAppliesToCanonical(subRow, presenterId)
      ) {
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
      simMembers = clearSkipDebtForUser(
        rotateMemberRow(simMembers, presenterId),
        presenterId,
      );
    }

    cursor = getMoscowDateString(addDays(moscowDateStringToUtc(cursor), 1));
  }

  return rows;
}

export async function ensureQueueOrder(teamId: Types.ObjectId): Promise<void> {
  await QueueOrder.updateOne(
    { teamId },
    { $setOnInsert: { teamId, members: [] } },
    { upsert: true },
  );
}

export async function appendUserToQueueEnd(
  teamId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<void> {
  await ensureQueueOrder(teamId);
  await migrateLegacyQueueOrderIfNeeded(teamId);
  const q = await QueueOrder.findOne({ teamId });
  if (!q) {
    return;
  }
  const list = q.members.map((m) => normalizeQueueMember(m));
  const without = list.filter((m) => !m.userId.equals(userId));
  without.push(normalizeQueueMember({ userId, active: true }));
  q.members = toIQueueMembers(without);
  await q.save();
}

export async function removeUserFromQueue(
  teamId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<void> {
  await migrateLegacyQueueOrderIfNeeded(teamId);
  await QueueOrder.updateOne(
    { teamId },
    { $pull: { members: { userId } } },
  );
}

export async function replaceQueueOrder(
  teamId: Types.ObjectId,
  members: QueueMemberPlain[],
): Promise<void> {
  await QueueOrder.findOneAndUpdate(
    { teamId },
    {
      $set: {
        members: toIQueueMembers(members),
      },
      $unset: { userIds: 1 },
    },
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
  const members: QueueMemberPlain[] = users.map((u) =>
    normalizeQueueMember({ userId: u._id, active: true }),
  );
  await replaceQueueOrder(teamId, members);
  return members.map((m) => m.userId.toString());
}
