import { describe, expect, it } from 'vitest';
import { getMoscowISODay, isStaticFederalHolidayMoscow } from './calendarService.js';

describe('isStaticFederalHolidayMoscow', () => {
  it('detects New Year', () => {
    expect(isStaticFederalHolidayMoscow('2026-01-01').hit).toBe(true);
  });

  it('returns false on ordinary Monday', () => {
    expect(isStaticFederalHolidayMoscow('2026-04-13').hit).toBe(false);
  });
});

describe('getMoscowISODay', () => {
  it('returns Monday=1 for 2026-04-13', () => {
    expect(getMoscowISODay('2026-04-13')).toBe(1);
  });

  it('returns Sunday=7 for 2026-04-12', () => {
    expect(getMoscowISODay('2026-04-12')).toBe(7);
  });
});
