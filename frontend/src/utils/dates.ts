/** Сегодняшняя дата в календаре Europe/Moscow в формате YYYY-MM-DD. */
export function moscowTodayString(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
}

export function weekdayRu(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' }).format(date);
}

export function formatDayMonthRu(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', timeZone: 'UTC' });
  const month = date.toLocaleDateString('ru-RU', { month: 'long', timeZone: 'UTC' });
  return `${day} ${month}`;
}
