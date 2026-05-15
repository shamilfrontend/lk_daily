import type { UserJobRole } from '@/constants/userJobRoles';
import { JOB_ROLE_COLORS, jobRoleSortIndex } from '@/constants/userJobRoles';
import type { User, Vacation } from '@/types/api';

export const MONTH_LABELS_SHORT = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
] as const;

export interface VacationBarSegment {
  vacationId: string;
  userId: string;
  startDate: string;
  endDate: string;
  leftPercent: number;
  widthPercent: number;
  hasConflict: boolean;
  color: string;
}

export interface ScheduleParticipantRow {
  user: User;
  bars: VacationBarSegment[];
}

export interface TimelineSegment {
  leftPercent: number;
  widthPercent: number;
}

export interface ConflictParticipant {
  userId: string;
  fullName: string;
}

export interface ConflictRange {
  role: UserJobRole;
  start: string;
  end: string;
  participants: ConflictParticipant[];
}

export function yearDateRange(year: number): { fromDate: string; toDate: string } {
  return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
}

export function daysInYear(year: number): number {
  const isLeap =
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmdUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function enumerateDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = parseYmd(start);
  const endTime = parseYmd(end).getTime();
  while (cursor.getTime() <= endTime) {
    days.push(formatYmdUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function clampIntervalToYear(
  startDate: string,
  endDate: string,
  year: number,
): { start: string; end: string } | null {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  const clampedStart = start > yearStart ? start : yearStart;
  const clampedEnd = end < yearEnd ? end : yearEnd;
  if (clampedStart > clampedEnd) return null;
  return { start: clampedStart, end: clampedEnd };
}

export function dayOffsetInYear(ymd: string, year: number): number {
  const yearStart = parseYmd(`${year}-01-01`);
  const day = parseYmd(ymd);
  return Math.round((day.getTime() - yearStart.getTime()) / 86_400_000);
}

export function detectSameRoleConflictDays(
  users: User[],
  vacations: Vacation[],
  year: number,
): Set<string> {
  const userById = new Map(users.map((u) => [u._id, u]));
  const vacationsByRole = new Map<
    UserJobRole,
    { userId: string; start: string; end: string }[]
  >();

  for (const vacation of vacations) {
    const user = userById.get(vacation.userId);
    const role = user?.jobRole;
    if (!role) continue;
    const clamped = clampIntervalToYear(
      vacation.startDate,
      vacation.endDate,
      year,
    );
    if (!clamped) continue;
    const list = vacationsByRole.get(role) ?? [];
    list.push({
      userId: vacation.userId,
      start: clamped.start,
      end: clamped.end,
    });
    vacationsByRole.set(role, list);
  }

  const conflictDays = new Set<string>();
  const totalDays = daysInYear(year);
  const yearStart = `${year}-01-01`;

  for (const intervals of vacationsByRole.values()) {
    const byUser = new Map<string, { start: string; end: string }[]>();
    for (const item of intervals) {
      const list = byUser.get(item.userId) ?? [];
      list.push({ start: item.start, end: item.end });
      byUser.set(item.userId, list);
    }
    if (byUser.size < 2) continue;

    for (let offset = 0; offset < totalDays; offset += 1) {
      const dayDate = parseYmd(yearStart);
      dayDate.setUTCDate(dayDate.getUTCDate() + offset);
      const day = formatYmdUtc(dayDate);
      let onVacationCount = 0;
      for (const userIntervals of byUser.values()) {
        const isAway = userIntervals.some(
          (interval) => day >= interval.start && day <= interval.end,
        );
        if (isAway) onVacationCount += 1;
      }
      if (onVacationCount >= 2) {
        conflictDays.add(day);
      }
    }
  }

  return conflictDays;
}

function detectConflictDaysForRole(
  users: User[],
  vacations: Vacation[],
  year: number,
  role: UserJobRole,
): Set<string> {
  const roleUserIds = new Set(
    users.filter((u) => u.jobRole === role).map((u) => u._id),
  );
  if (roleUserIds.size < 2) return new Set();

  const byUser = new Map<string, { start: string; end: string }[]>();
  for (const vacation of vacations) {
    if (!roleUserIds.has(vacation.userId)) continue;
    const clamped = clampIntervalToYear(
      vacation.startDate,
      vacation.endDate,
      year,
    );
    if (!clamped) continue;
    const list = byUser.get(vacation.userId) ?? [];
    list.push({ start: clamped.start, end: clamped.end });
    byUser.set(vacation.userId, list);
  }
  if (byUser.size < 2) return new Set();

  const conflictDays = new Set<string>();
  const totalDays = daysInYear(year);
  const yearStart = `${year}-01-01`;

  for (let offset = 0; offset < totalDays; offset += 1) {
    const dayDate = parseYmd(yearStart);
    dayDate.setUTCDate(dayDate.getUTCDate() + offset);
    const day = formatYmdUtc(dayDate);
    let onVacationCount = 0;
    for (const userIntervals of byUser.values()) {
      const isAway = userIntervals.some(
        (interval) => day >= interval.start && day <= interval.end,
      );
      if (isAway) onVacationCount += 1;
    }
    if (onVacationCount >= 2) {
      conflictDays.add(day);
    }
  }

  return conflictDays;
}

function mergeSortedDaysToRanges(sortedDays: string[]): { start: string; end: string }[] {
  if (sortedDays.length === 0) return [];
  const ranges: { start: string; end: string }[] = [];
  let rangeStart = sortedDays[0];
  let rangeEnd = sortedDays[0];

  for (let i = 1; i < sortedDays.length; i += 1) {
    const prev = parseYmd(rangeEnd);
    const curr = parseYmd(sortedDays[i]);
    prev.setUTCDate(prev.getUTCDate() + 1);
    if (formatYmdUtc(prev) === sortedDays[i]) {
      rangeEnd = sortedDays[i];
    } else {
      ranges.push({ start: rangeStart, end: rangeEnd });
      rangeStart = sortedDays[i];
      rangeEnd = sortedDays[i];
    }
  }
  ranges.push({ start: rangeStart, end: rangeEnd });
  return ranges;
}

function participantsOverlappingRange(
  users: User[],
  vacations: Vacation[],
  year: number,
  role: UserJobRole,
  rangeStart: string,
  rangeEnd: string,
): ConflictParticipant[] {
  const roleUsers = users.filter((u) => u.jobRole === role);
  const seen = new Set<string>();
  const result: ConflictParticipant[] = [];

  for (const user of roleUsers) {
    const userVacations = vacations.filter((v) => v.userId === user._id);
    const overlaps = userVacations.some((vacation) => {
      const clamped = clampIntervalToYear(
        vacation.startDate,
        vacation.endDate,
        year,
      );
      if (!clamped) return false;
      return clamped.start <= rangeEnd && clamped.end >= rangeStart;
    });
    if (overlaps && !seen.has(user._id)) {
      seen.add(user._id);
      result.push({ userId: user._id, fullName: user.fullName });
    }
  }

  return result.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
}

export function buildSameRoleConflictRanges(
  users: User[],
  vacations: Vacation[],
  year: number,
): ConflictRange[] {
  const roles = new Set<UserJobRole>();
  for (const user of users) {
    if (user.jobRole) roles.add(user.jobRole);
  }

  const ranges: ConflictRange[] = [];

  for (const role of roles) {
    const conflictDays = detectConflictDaysForRole(users, vacations, year, role);
    const dayRanges = mergeSortedDaysToRanges([...conflictDays].sort());
    for (const { start, end } of dayRanges) {
      ranges.push({
        role,
        start,
        end,
        participants: participantsOverlappingRange(
          users,
          vacations,
          year,
          role,
          start,
          end,
        ),
      });
    }
  }

  return ranges.sort((a, b) => a.start.localeCompare(b.start));
}

export function nonWorkingSegmentsForYear(
  dates: string[],
  year: number,
): TimelineSegment[] {
  const inYear = [...new Set(dates.filter((d) => d.startsWith(String(year))))].sort();
  const merged = mergeSortedDaysToRanges(inYear);
  const total = daysInYear(year);

  return merged.map(({ start, end }) => {
    const startOffset = dayOffsetInYear(start, year);
    const endOffset = dayOffsetInYear(end, year);
    const spanDays = endOffset - startOffset + 1;
    return {
      leftPercent: (startOffset / total) * 100,
      widthPercent: (spanDays / total) * 100,
    };
  });
}

export function vacationDurationDays(start: string, end: string): number {
  return enumerateDaysBetween(start.slice(0, 10), end.slice(0, 10)).length;
}

export function intervalHasConflictDay(
  start: string,
  end: string,
  conflictDays: Set<string>,
): boolean {
  if (conflictDays.size === 0) return false;
  const days = enumerateDaysBetween(start, end);
  return days.some((day) => conflictDays.has(day));
}

export function monthsWithConflictDays(
  conflictDays: Set<string>,
  year: number,
): Set<number> {
  const months = new Set<number>();
  for (const day of conflictDays) {
    if (!day.startsWith(String(year))) continue;
    const month = Number(day.slice(5, 7)) - 1;
    if (month >= 0 && month <= 11) months.add(month);
  }
  return months;
}

export function barColorForRole(role: UserJobRole | null | undefined): string {
  if (!role) return '#94a3b8';
  return JOB_ROLE_COLORS[role] ?? '#94a3b8';
}

export function buildVacationBar(
  vacation: Vacation,
  year: number,
  conflictDays: Set<string>,
  jobRole: UserJobRole | null | undefined,
): VacationBarSegment | null {
  const clamped = clampIntervalToYear(
    vacation.startDate,
    vacation.endDate,
    year,
  );
  if (!clamped) return null;

  const total = daysInYear(year);
  const startOffset = dayOffsetInYear(clamped.start, year);
  const endOffset = dayOffsetInYear(clamped.end, year);
  const spanDays = endOffset - startOffset + 1;

  return {
    vacationId: vacation._id,
    userId: vacation.userId,
    startDate: clamped.start,
    endDate: clamped.end,
    leftPercent: (startOffset / total) * 100,
    widthPercent: (spanDays / total) * 100,
    hasConflict: intervalHasConflictDay(
      clamped.start,
      clamped.end,
      conflictDays,
    ),
    color: barColorForRole(jobRole),
  };
}

export function sortScheduleRowsByRole(
  rows: ScheduleParticipantRow[],
): ScheduleParticipantRow[] {
  return [...rows].sort((a, b) => {
    const byRole =
      jobRoleSortIndex(a.user.jobRole) - jobRoleSortIndex(b.user.jobRole);
    if (byRole !== 0) return byRole;
    return a.user.fullName.localeCompare(b.user.fullName, 'ru');
  });
}

export function isFirstRowInRoleGroup(
  rows: ScheduleParticipantRow[],
  index: number,
): boolean {
  if (index === 0) return true;
  const current = rows[index]?.user.jobRole ?? null;
  const previous = rows[index - 1]?.user.jobRole ?? null;
  return current !== previous;
}

export function buildScheduleRows(
  users: User[],
  vacations: Vacation[],
  year: number,
  conflictDays: Set<string>,
): ScheduleParticipantRow[] {
  const vacationsByUser = new Map<string, Vacation[]>();
  for (const vacation of vacations) {
    const list = vacationsByUser.get(vacation.userId) ?? [];
    list.push(vacation);
    vacationsByUser.set(vacation.userId, list);
  }

  return users.map((user) => {
    const userVacations = vacationsByUser.get(user._id) ?? [];
    const bars = userVacations
      .map((vacation) =>
        buildVacationBar(vacation, year, conflictDays, user.jobRole),
      )
      .filter((bar): bar is VacationBarSegment => bar !== null)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    return { user, bars };
  });
}
