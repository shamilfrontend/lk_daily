import { describe, expect, it } from 'vitest';

import {
  assessLaborVacationCompliance,
  collectUserVacationIntervals,
  totalCalendarDaysInYear,
} from '@/utils/vacationLaborCompliance';

import type { Vacation } from '@/types/api';

const userId = 'u1';

function vacation(
  id: string,
  startDate: string,
  endDate: string,
): Vacation {
  return { _id: id, userId, startDate, endDate };
}

describe('vacationLaborCompliance', () => {
  it('14 + 14 дня — соответствует норме ТК', () => {
    const vacations: Vacation[] = [
      vacation('v1', '2026-01-10', '2026-01-23'),
      vacation('v2', '2026-07-01', '2026-07-14'),
    ];
    const result = assessLaborVacationCompliance(userId, vacations, 2026);
    expect(result.isCompliant).toBe(true);
    expect(result.totalDays).toBe(28);
    expect(result.maxPeriodDays).toBe(14);
  });

  it('7+7+7+7 — нет периода ≥14 дней', () => {
    const vacations: Vacation[] = [
      vacation('v1', '2026-01-01', '2026-01-07'),
      vacation('v2', '2026-02-01', '2026-02-07'),
      vacation('v3', '2026-03-01', '2026-03-07'),
      vacation('v4', '2026-04-01', '2026-04-07'),
    ];
    const result = assessLaborVacationCompliance(userId, vacations, 2026);
    expect(result.isCompliant).toBe(false);
    expect(result.totalDays).toBe(28);
    expect(result.issues.some((i) => i.includes('14'))).toBe(true);
  });

  it('15 + 15 — превышение 28 дней', () => {
    const vacations: Vacation[] = [
      vacation('v1', '2026-06-01', '2026-06-15'),
      vacation('v2', '2026-08-01', '2026-08-15'),
    ];
    const result = assessLaborVacationCompliance(userId, vacations, 2026);
    expect(result.isCompliant).toBe(false);
    expect(result.totalDays).toBe(30);
    expect(result.issues.some((i) => i.includes('28'))).toBe(true);
  });

  it('пересекающиеся периоды не дублируют дни в total', () => {
    const vacations: Vacation[] = [
      vacation('v1', '2026-06-10', '2026-06-20'),
      vacation('v2', '2026-06-15', '2026-06-25'),
    ];
    const intervals = collectUserVacationIntervals(userId, vacations, 2026);
    expect(totalCalendarDaysInYear(intervals)).toBe(16);
  });

  it('период через границу года — только дни внутри года', () => {
    const vacations: Vacation[] = [
      vacation('v1', '2025-12-20', '2026-01-10'),
    ];
    const result = assessLaborVacationCompliance(userId, vacations, 2026);
    expect(result.totalDays).toBe(10);
    expect(result.maxPeriodDays).toBe(10);
  });

  it('draft подменяет редактируемый период', () => {
    const vacations: Vacation[] = [
      vacation('v1', '2026-01-01', '2026-01-07'),
    ];
    const result = assessLaborVacationCompliance(userId, vacations, 2026, {
      vacationId: 'v1',
      startDate: '2026-01-01',
      endDate: '2026-01-20',
    });
    expect(result.totalDays).toBe(20);
    expect(result.maxPeriodDays).toBe(20);
    expect(result.isCompliant).toBe(true);
  });
});
