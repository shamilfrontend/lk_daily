import { NonWorkingDay } from '../models/NonWorkingDay.js';
import { HolidayTransfer } from '../models/HolidayTransfer.js';
import { checkerCache } from './calendarCheckerCache.js';
import { MOSCOW_TZ, moscowDateStringToUtc, utcDateToMoscowDateString } from '../utils/dateHelpers.js';

export { invalidateCalendarCache } from './calendarCheckerCache.js';

/** Федеральные праздники по ст. 112 ТК РФ (месяц и день в календаре Москвы). */
const FEDERAL_MD: readonly { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: 'Новогодние каникулы' },
  { month: 1, day: 2, name: 'Новогодние каникулы' },
  { month: 1, day: 3, name: 'Новогодние каникулы' },
  { month: 1, day: 4, name: 'Новогодние каникулы' },
  { month: 1, day: 5, name: 'Новогодние каникулы' },
  { month: 1, day: 6, name: 'Новогодние каникулы' },
  { month: 1, day: 7, name: 'Рождество Христово' },
  { month: 1, day: 8, name: 'Новогодние каникулы' },
  { month: 2, day: 23, name: 'День защитника Отечества' },
  { month: 3, day: 8, name: 'Международный женский день' },
  { month: 5, day: 1, name: 'Праздник Весны и Труда' },
  { month: 5, day: 9, name: 'День Победы' },
  { month: 6, day: 12, name: 'День России' },
  { month: 11, day: 4, name: 'День народного единства' },
];

function parseMoscowDateString(dateStr: string): { y: number; m: number; d: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date');
  }
  const [y, m, day] = dateStr.split('-').map(Number);
  return { y, m, d: day };
}

export function isStaticFederalHolidayMoscow(dateStr: string): { hit: boolean; name?: string } {
  const { m, d } = parseMoscowDateString(dateStr);
  const row = FEDERAL_MD.find((x) => x.month === m && x.day === d);
  return row ? { hit: true, name: row.name } : { hit: false };
}

/** 1 = Mon ... 7 = Sun для календарного дня Москвы (через Intl, не зависит от TZ сервера). */
export function getMoscowISODay(dateStr: string): number {
  const inst = moscowDateStringToUtc(dateStr);
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TZ,
    weekday: 'long',
  })
    .formatToParts(inst)
    .find((p) => p.type === 'weekday')?.value;
  const map: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };
  const n = wd ? map[wd] : 0;
  if (!n) {
    throw new Error('Failed to resolve weekday');
  }
  return n;
}

type CalendarData = {
  customDates: Set<string>;
  regionalDates: Set<string>;
  transferToDates: Set<string>;
  transferFromDates: Set<string>;
  dbFederalTransferDates: Set<string>;
};

function cacheKey(year: number, teamRegion?: string): string {
  return `${year}:${teamRegion ?? ''}`;
}

function parseYear(dateStr: string): number {
  return Number(dateStr.slice(0, 4));
}

async function loadCalendarDataForYear(year: number, teamRegion?: string): Promise<CalendarData> {
  const start = moscowDateStringToUtc(`${year}-01-01`);
  const end = moscowDateStringToUtc(`${year + 1}-01-01`);

  const [transfers, nonWorkingRows] = await Promise.all([
    HolidayTransfer.find({ year }).lean(),
    NonWorkingDay.find({ date: { $gte: start, $lt: end } }).lean(),
  ]);

  const customDates = new Set<string>();
  const regionalDates = new Set<string>();
  const dbFederalTransferDates = new Set<string>();

  for (const row of nonWorkingRows) {
    const day = utcDateToMoscowDateString(row.date);
    if (row.type === 'custom') {
      customDates.add(day);
    } else if (row.type === 'regional' && teamRegion && row.region === teamRegion) {
      regionalDates.add(day);
    } else if (row.type === 'federal' || row.type === 'transfer') {
      dbFederalTransferDates.add(day);
    }
  }

  return {
    customDates,
    regionalDates,
    transferToDates: new Set(transfers.map((t) => utcDateToMoscowDateString(t.toDate))),
    transferFromDates: new Set(transfers.map((t) => utcDateToMoscowDateString(t.fromDate))),
    dbFederalTransferDates,
  };
}

export async function getWorkingDayCheckerForYear(
  year: number,
  teamRegion?: string,
): Promise<(dateStr: string) => boolean> {
  const key = cacheKey(year, teamRegion);
  const cached = checkerCache.get(key);
  if (cached) {
    return cached;
  }

  const data = await loadCalendarDataForYear(year, teamRegion);
  const checker = (moscowDateStr: string): boolean => {
    if (data.customDates.has(moscowDateStr)) {
      return false;
    }
    if (data.transferToDates.has(moscowDateStr)) {
      return false;
    }
    if (isStaticFederalHolidayMoscow(moscowDateStr).hit && !data.transferFromDates.has(moscowDateStr)) {
      return false;
    }
    if (data.dbFederalTransferDates.has(moscowDateStr)) {
      return false;
    }
    if (teamRegion && data.regionalDates.has(moscowDateStr)) {
      return false;
    }

    const isoDow = getMoscowISODay(moscowDateStr);
    if (isoDow === 6 || isoDow === 7) {
      return data.transferFromDates.has(moscowDateStr);
    }
    return true;
  };

  checkerCache.set(key, checker);
  return checker;
}

export async function isWorkingDay(moscowDateStr: string, teamRegion?: string): Promise<boolean> {
  const checker = await getWorkingDayCheckerForYear(parseYear(moscowDateStr), teamRegion);
  return checker(moscowDateStr);
}

/** Краткое объяснение, почему день нерабочий (когда `isWorkingDay` = false). */
export async function explainWhyNonWorking(moscowDateStr: string, teamRegion?: string): Promise<string> {
  const year = parseYear(moscowDateStr);
  const data = await loadCalendarDataForYear(year, teamRegion);

  if (data.customDates.has(moscowDateStr)) {
    return 'Пользовательский нерабочий день';
  }
  if (data.transferToDates.has(moscowDateStr)) {
    return 'Перенос выходного дня (дополнительный выходной)';
  }
  const fed = isStaticFederalHolidayMoscow(moscowDateStr);
  if (fed.hit && !data.transferFromDates.has(moscowDateStr)) {
    return fed.name ? `Федеральный праздник: ${fed.name}` : 'Федеральный праздник';
  }
  if (data.dbFederalTransferDates.has(moscowDateStr)) {
    return 'Нерабочий день (из календаря переносов)';
  }
  if (teamRegion && data.regionalDates.has(moscowDateStr)) {
    return 'Региональный нерабочий день';
  }
  const isoDow = getMoscowISODay(moscowDateStr);
  if (isoDow === 6 || isoDow === 7) {
    if (data.transferFromDates.has(moscowDateStr)) {
      return 'Рабочий день (перенос с выходного)';
    }
    return isoDow === 6 ? 'Суббота' : 'Воскресенье';
  }
  return 'Нерабочий день';
}

export function listFederalHolidayStringsForYear(year: number): { date: string; name: string }[] {
  return FEDERAL_MD.map(({ month, day, name }) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    name,
  }));
}

export async function listNonWorkingDaysForYear(
  year: number,
  teamRegion?: string,
): Promise<
  { id: string | null; date: string; type: string; description?: string; region?: string }[]
> {
  const start = moscowDateStringToUtc(`${year}-01-01`);
  const end = moscowDateStringToUtc(`${year + 1}-01-01`);

  const [rows, transfers, checker] = await Promise.all([
    NonWorkingDay.find({ date: { $gte: start, $lt: end } }).lean(),
    HolidayTransfer.find({ year }).lean(),
    getWorkingDayCheckerForYear(year, teamRegion),
  ]);

  const transferFromDates = new Set(transfers.map((t) => utcDateToMoscowDateString(t.fromDate)));
  const items: { id: string | null; date: string; type: string; description?: string; region?: string }[] = [];

  for (const h of listFederalHolidayStringsForYear(year)) {
    if (!transferFromDates.has(h.date)) {
      items.push({ id: null, date: h.date, type: 'federal', description: h.name });
    }
  }

  for (const tr of transfers) {
    items.push({
      id: tr._id.toString(),
      date: utcDateToMoscowDateString(tr.toDate),
      type: 'transfer',
      description: tr.description || 'Перенесенный выходной день',
    });
  }

  for (const row of rows) {
    if (row.type === 'regional' && teamRegion && row.region !== teamRegion) {
      continue;
    }
    if (row.type === 'regional' && !teamRegion) {
      continue;
    }
    const date = utcDateToMoscowDateString(row.date);
    const isNonWorking = !checker(date);
    if (!isNonWorking && row.type !== 'regional' && row.type !== 'custom') {
      continue;
    }
    items.push({
      id: row._id.toString(),
      date,
      type: row.type,
      description: row.description,
      region: row.region,
    });
  }

  const uniq = new Map<string, { id: string | null; date: string; type: string; description?: string; region?: string }>();
  for (const item of items) {
    const key = `${item.date}|${item.type}|${item.region ?? ''}|${item.description ?? ''}`;
    if (!uniq.has(key)) {
      uniq.set(key, item);
    }
  }

  return [...uniq.values()].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.type.localeCompare(b.type);
  });
}
