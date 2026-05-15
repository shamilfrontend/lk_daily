import {
  LABOR_ANNUAL_VACATION_DAYS,
  LABOR_MIN_UNINTERRUPTED_DAYS,
} from '@/constants/laborVacationRules';
import type { Vacation } from '@/types/api';
import {
  clampIntervalToYear,
  enumerateDaysBetween,
  vacationDurationDays,
} from '@/utils/vacationSchedule';

export interface VacationInterval {
  start: string;
  end: string;
}

export interface LaborVacationDraft {
  vacationId?: string;
  startDate: string;
  endDate: string;
}

export interface LaborVacationCompliance {
  totalDays: number;
  maxPeriodDays: number;
  periodCount: number;
  issues: string[];
  isCompliant: boolean;
}

function periodDaysInYear(start: string, end: string): number {
  return vacationDurationDays(start, end);
}

export function collectUserVacationIntervals(
  userId: string,
  vacations: Vacation[],
  year: number,
  draft?: LaborVacationDraft,
): VacationInterval[] {
  const intervals: VacationInterval[] = [];

  for (const vacation of vacations) {
    if (vacation.userId !== userId) continue;
    if (draft?.vacationId && vacation._id === draft.vacationId) continue;

    const clamped = clampIntervalToYear(
      vacation.startDate,
      vacation.endDate,
      year,
    );
    if (clamped) {
      intervals.push(clamped);
    }
  }

  if (draft) {
    const start = draft.startDate.trim().slice(0, 10);
    const end = draft.endDate.trim().slice(0, 10);
    if (start && end && start <= end) {
      const clamped = clampIntervalToYear(start, end, year);
      if (clamped) {
        intervals.push(clamped);
      }
    }
  }

  return intervals.sort((a, b) => a.start.localeCompare(b.start));
}

export function totalCalendarDaysInYear(intervals: VacationInterval[]): number {
  const uniqueDays = new Set<string>();
  for (const interval of intervals) {
    for (const day of enumerateDaysBetween(interval.start, interval.end)) {
      uniqueDays.add(day);
    }
  }
  return uniqueDays.size;
}

export function assessLaborVacationCompliance(
  userId: string,
  vacations: Vacation[],
  year: number,
  draft?: LaborVacationDraft,
): LaborVacationCompliance {
  const intervals = collectUserVacationIntervals(userId, vacations, year, draft);
  const totalDays = totalCalendarDaysInYear(intervals);
  const periodLengths = intervals.map((i) => periodDaysInYear(i.start, i.end));
  const maxPeriodDays =
    periodLengths.length > 0 ? Math.max(...periodLengths) : 0;
  const periodCount = intervals.length;

  const issues: string[] = [];

  if (totalDays > LABOR_ANNUAL_VACATION_DAYS) {
    issues.push(
      `Превышен лимит ${LABOR_ANNUAL_VACATION_DAYS} календарных дней (${totalDays})`,
    );
  }

  if (periodCount > 0 && maxPeriodDays < LABOR_MIN_UNINTERRUPTED_DAYS) {
    issues.push(
      `Нет отпуска не менее ${LABOR_MIN_UNINTERRUPTED_DAYS} календарных дней подряд`,
    );
  }

  return {
    totalDays,
    maxPeriodDays,
    periodCount,
    issues,
    isCompliant: issues.length === 0,
  };
}

export function complianceSummaryRu(result: LaborVacationCompliance): string {
  const total = `${result.totalDays}/${LABOR_ANNUAL_VACATION_DAYS}`;
  if (result.isCompliant) {
    return result.periodCount === 0 ? '0/28' : total;
  }
  if (result.totalDays > LABOR_ANNUAL_VACATION_DAYS) {
    return total;
  }
  if (result.periodCount > 0 && result.maxPeriodDays < LABOR_MIN_UNINTERRUPTED_DAYS) {
    return `макс. ${result.maxPeriodDays} дн.`;
  }
  return total;
}

export function complianceDetailRu(result: LaborVacationCompliance): string {
  if (result.periodCount === 0) {
    return `Отпуск не запланирован (норма ${LABOR_ANNUAL_VACATION_DAYS} календарных дней в год)`;
  }
  return `Запланировано ${result.totalDays} из ${LABOR_ANNUAL_VACATION_DAYS} календарных дней`;
}
