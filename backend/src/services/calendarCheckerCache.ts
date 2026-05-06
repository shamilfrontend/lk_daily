/** In-memory cache для `getWorkingDayCheckerForYear`; сбрасывается при мутациях календарных коллекций. */

export const checkerCache = new Map<string, (dateStr: string) => boolean>();

export function invalidateCalendarCache(): void {
  checkerCache.clear();
}
