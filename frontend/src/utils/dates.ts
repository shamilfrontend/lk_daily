/** Сегодняшняя дата в календаре Europe/Moscow в формате YYYY-MM-DD. */
export function moscowTodayString(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
    new Date(),
  );
}

/**
 * Календарная дата для интерфейса: день.месяц.год (например 22.04.2026).
 * Разбирает префикс YYYY-MM-DD у ISO-строки или отдельной даты.
 */
/** Период отпуска: 10.06.2026 — 20.06.2026 (или одна дата). */
export function formatVacationRangeRu(start: string, end: string): string {
  const from = formatCalendarDateRu(start);
  const to = formatCalendarDateRu(end);
  if (from === to) return from;
  return `${from} — ${to}`;
}

/** Короткий период для подписи на полосе: 10.06 — 20.06. */
export function formatVacationRangeShortRu(start: string, end: string): string {
  const from = formatCalendarDateRu(start);
  const to = formatCalendarDateRu(end);
  if (from === to) return from.slice(0, 5);
  if (start.slice(0, 4) === end.slice(0, 4)) {
    return `${from.slice(0, 5)} — ${to.slice(0, 5)}`;
  }
  return formatVacationRangeRu(start, end);
}

export function formatCalendarDateRu(isoOrYmd: string): string {
  const s = isoOrYmd.trim();
  if (!s) {
    return '';
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
  return s;
}

/**
 * Дата и время для интерфейса: день.месяц.год, чч:мм (локальное время браузера).
 */
export function formatCalendarDateTimeRu(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  if (Number.isNaN(d.getTime())) {
    return isoDatetime;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
}

export function weekdayRu(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
}
