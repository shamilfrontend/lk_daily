import { NonWorkingDay } from '../models/NonWorkingDay.js';
import { MOSCOW_TZ, moscowDateStringToUtc, utcDateToMoscowDateString } from '../utils/dateHelpers.js';

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

/**
 * MVP: федеральные праздники из кода + пользовательские дни из БД.
 * Переносы выходных и региональные праздники — в следующей итерации.
 */
export async function isWorkingDay(moscowDateStr: string): Promise<boolean> {
  const isoDow = getMoscowISODay(moscowDateStr);
  if (isoDow === 6 || isoDow === 7) {
    return false;
  }

  if (isStaticFederalHolidayMoscow(moscowDateStr).hit) {
    return false;
  }

  const dayStart = moscowDateStringToUtc(moscowDateStr);
  const existsCustom = await NonWorkingDay.exists({
    type: 'custom',
    date: dayStart,
  });
  return !existsCustom;
}

export function listFederalHolidayStringsForYear(year: number): { date: string; name: string }[] {
  return FEDERAL_MD.map(({ month, day, name }) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    name,
  }));
}

export async function listNonWorkingDaysForYear(
  year: number,
): Promise<
  { id: string | null; date: string; type: string; description?: string; region?: string }[]
> {
  const federal = listFederalHolidayStringsForYear(year).map((h) => ({
    id: null,
    date: h.date,
    type: 'federal' as const,
    description: h.name,
  }));

  const start = moscowDateStringToUtc(`${year}-01-01`);
  const end = moscowDateStringToUtc(`${year + 1}-01-01`);

  const customs = await NonWorkingDay.find({
    type: 'custom',
    date: { $gte: start, $lt: end },
  }).lean();

  const customMapped = customs.map((c) => ({
    id: c._id.toString(),
    date: utcDateToMoscowDateString(c.date),
    type: 'custom' as const,
    description: c.description,
    region: c.region,
  }));

  const byDate = new Map<string, { id: string | null; date: string; type: string; description?: string; region?: string }>();

  for (const f of federal) {
    byDate.set(f.date, f);
  }
  for (const c of customMapped) {
    byDate.set(c.date, c);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
