import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const MOSCOW_TZ = 'Europe/Moscow';

/** Текущий момент как календарная дата в Москве (YYYY-MM-DD). */
export function getMoscowDateString(date: Date = new Date()): string {
  return formatInTimeZone(date, MOSCOW_TZ, 'yyyy-MM-dd');
}

/** UTC Date, соответствующий полуночи указанного календарного дня в Москве. */
export function moscowDateStringToUtc(dateStr: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, MOSCOW_TZ);
}

/** Следующий календарный день Москвы после `moscowYyyyMmDd` (строка YYYY-MM-DD). */
export function nextMoscowDateString(moscowYyyyMmDd: string): string {
  return getMoscowDateString(addDays(moscowDateStringToUtc(moscowYyyyMmDd), 1));
}

/** Парсинг YYYY-MM-DD из тела запроса в UTC-инстант начала дня по Москве. */
export function parseMoscowDayInput(input: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('Invalid date format, expected YYYY-MM-DD');
  }
  return moscowDateStringToUtc(input);
}

export function utcDateToMoscowDateString(d: Date): string {
  return formatInTimeZone(d, MOSCOW_TZ, 'yyyy-MM-dd');
}

/** День недели по календарной дате Москвы (длинное название, ru). */
export function formatMoscowWeekdayLongRu(moscowYyyyMmDd: string): string {
  const inst = moscowDateStringToUtc(moscowYyyyMmDd);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    timeZone: MOSCOW_TZ,
  }).format(inst);
}
