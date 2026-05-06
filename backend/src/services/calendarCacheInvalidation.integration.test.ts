import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { NonWorkingDay } from '../models/NonWorkingDay.js';
import { HolidayTransfer } from '../models/HolidayTransfer.js';
import { checkerCache } from './calendarCheckerCache.js';
import { getWorkingDayCheckerForYear } from './calendarService.js';
import { moscowDateStringToUtc } from '../utils/dateHelpers.js';

describe('calendar checker cache invalidation', () => {
  let mongoReplSet: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'lk-daily-cal-cache-test' },
    });
    await mongoose.connect(mongoReplSet.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoReplSet) {
      await mongoReplSet.stop();
    }
  });

  it('clears checker cache after NonWorkingDay save', async () => {
    checkerCache.clear();
    const year = 2030;
    const customDay = '2030-06-11';
    const checker1 = await getWorkingDayCheckerForYear(year);
    expect(checker1(customDay)).toBe(true);

    await NonWorkingDay.create({
      date: moscowDateStringToUtc(customDay),
      type: 'custom',
      description: 'test custom day',
    });

    expect(checkerCache.size).toBe(0);

    const checker2 = await getWorkingDayCheckerForYear(year);
    expect(checker2(customDay)).toBe(false);
  });

  it('clears checker cache after HolidayTransfer save', async () => {
    checkerCache.clear();
    const year = 2026;
    await HolidayTransfer.deleteMany({ year });
    const weekday = '2026-04-13';
    const checker1 = await getWorkingDayCheckerForYear(year);
    expect(checker1(weekday)).toBe(true);

    await HolidayTransfer.create({
      fromDate: moscowDateStringToUtc('2026-04-11'),
      toDate: moscowDateStringToUtc(weekday),
      year,
      description: 'transfer test',
    });

    expect(checkerCache.size).toBe(0);

    const checker2 = await getWorkingDayCheckerForYear(year);
    expect(checker2(weekday)).toBe(false);
  });
});
