import { describe, expect, it } from 'vitest';

import {
  buildSameRoleConflictRanges,
  buildScheduleRows,
  clampIntervalToYear,
  detectSameRoleConflictDays,
  intervalHasConflictDay,
  nonWorkingSegmentsForYear,
  sortScheduleRowsByRole,
} from '@/utils/vacationSchedule';

import type { User, Vacation } from '@/types/api';

const users: User[] = [
  {
    _id: 'u1',
    fullName: 'A',
    teamId: 't1',
    isActive: true,
    jobRole: 'frontend',
  },
  {
    _id: 'u2',
    fullName: 'B',
    teamId: 't1',
    isActive: true,
    jobRole: 'frontend',
  },
  {
    _id: 'u3',
    fullName: 'C',
    teamId: 't1',
    isActive: true,
    jobRole: 'backend',
  },
];

describe('vacationSchedule', () => {
  it('clampIntervalToYear обрезает период по границам года', () => {
    expect(
      clampIntervalToYear('2025-11-01', '2026-02-01', 2026),
    ).toEqual({ start: '2026-01-01', end: '2026-02-01' });
    expect(clampIntervalToYear('2026-03-01', '2027-01-01', 2026)).toEqual({
      start: '2026-03-01',
      end: '2026-12-31',
    });
    expect(clampIntervalToYear('2027-01-01', '2027-02-01', 2026)).toBeNull();
  });

  it('detectSameRoleConflictDays находит дни с двумя фронтендами', () => {
    const vacations: Vacation[] = [
      {
        _id: 'v1',
        userId: 'u1',
        startDate: '2026-06-10',
        endDate: '2026-06-20',
      },
      {
        _id: 'v2',
        userId: 'u2',
        startDate: '2026-06-15',
        endDate: '2026-06-25',
      },
      {
        _id: 'v3',
        userId: 'u3',
        startDate: '2026-06-15',
        endDate: '2026-06-25',
      },
    ];
    const conflicts = detectSameRoleConflictDays(users, vacations, 2026);
    expect(conflicts.has('2026-06-15')).toBe(true);
    expect(conflicts.has('2026-06-20')).toBe(true);
    expect(conflicts.has('2026-06-10')).toBe(false);
    expect(conflicts.has('2026-06-25')).toBe(false);
  });

  it('не считает конфликт без роли или в разных ролях', () => {
    const noRoleUsers: User[] = [
      { _id: 'x1', fullName: 'X1', teamId: 't1', isActive: true },
      { _id: 'x2', fullName: 'X2', teamId: 't1', isActive: true },
    ];
    const vacations: Vacation[] = [
      { _id: 'v1', userId: 'x1', startDate: '2026-07-01', endDate: '2026-07-10' },
      { _id: 'v2', userId: 'x2', startDate: '2026-07-05', endDate: '2026-07-15' },
    ];
    expect(detectSameRoleConflictDays(noRoleUsers, vacations, 2026).size).toBe(0);
  });

  it('intervalHasConflictDay проверяет пересечение с множеством дней', () => {
    const days = new Set(['2026-08-05']);
    expect(intervalHasConflictDay('2026-08-01', '2026-08-10', days)).toBe(true);
    expect(intervalHasConflictDay('2026-08-01', '2026-08-04', days)).toBe(false);
  });

  it('buildSameRoleConflictRanges объединяет дни и возвращает участников', () => {
    const vacations: Vacation[] = [
      {
        _id: 'v1',
        userId: 'u1',
        startDate: '2026-06-10',
        endDate: '2026-06-20',
      },
      {
        _id: 'v2',
        userId: 'u2',
        startDate: '2026-06-15',
        endDate: '2026-06-25',
      },
    ];
    const ranges = buildSameRoleConflictRanges(users, vacations, 2026);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      role: 'frontend',
      start: '2026-06-15',
      end: '2026-06-20',
      kind: 'overlap',
    });
    expect(ranges[0].participants.map((p) => p.fullName).sort()).toEqual(['A', 'B']);
  });

  it('3 frontend: 2 в отпуске 5 дней — без конфликта', () => {
    const threeFrontend: User[] = [
      ...users.filter((u) => u.jobRole === 'frontend'),
      {
        _id: 'u4',
        fullName: 'D',
        teamId: 't1',
        isActive: true,
        jobRole: 'frontend',
      },
    ];
    const vacations: Vacation[] = [
      {
        _id: 'v1',
        userId: 'u1',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
      },
      {
        _id: 'v2',
        userId: 'u2',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
      },
    ];
    const conflicts = detectSameRoleConflictDays(threeFrontend, vacations, 2026);
    expect(conflicts.size).toBe(0);
  });

  it('3 frontend: 2 в отпуске 8 дней подряд — конфликт solo_coverage на всей серии', () => {
    const threeFrontend: User[] = [
      ...users.filter((u) => u.jobRole === 'frontend'),
      {
        _id: 'u4',
        fullName: 'D',
        teamId: 't1',
        isActive: true,
        jobRole: 'frontend',
      },
    ];
    const vacations: Vacation[] = [
      {
        _id: 'v1',
        userId: 'u1',
        startDate: '2026-07-01',
        endDate: '2026-07-08',
      },
      {
        _id: 'v2',
        userId: 'u2',
        startDate: '2026-07-01',
        endDate: '2026-07-08',
      },
    ];
    const conflicts = detectSameRoleConflictDays(threeFrontend, vacations, 2026);
    expect(conflicts.size).toBe(8);
    expect(conflicts.has('2026-07-01')).toBe(true);
    expect(conflicts.has('2026-07-08')).toBe(true);
    const ranges = buildSameRoleConflictRanges(threeFrontend, vacations, 2026);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].kind).toBe('solo_coverage_limit');
  });

  it('3 frontend: все 3 в отпуске — конфликт no_coverage', () => {
    const threeFrontend: User[] = [
      ...users.filter((u) => u.jobRole === 'frontend'),
      {
        _id: 'u4',
        fullName: 'D',
        teamId: 't1',
        isActive: true,
        jobRole: 'frontend',
      },
    ];
    const vacations: Vacation[] = [
      {
        _id: 'v1',
        userId: 'u1',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
      },
      {
        _id: 'v2',
        userId: 'u2',
        startDate: '2026-08-10',
        endDate: '2026-08-12',
      },
      {
        _id: 'v3',
        userId: 'u4',
        startDate: '2026-08-11',
        endDate: '2026-08-11',
      },
    ];
    const conflicts = detectSameRoleConflictDays(threeFrontend, vacations, 2026);
    expect(conflicts.has('2026-08-11')).toBe(true);
    const ranges = buildSameRoleConflictRanges(threeFrontend, vacations, 2026);
    expect(ranges.some((r) => r.kind === 'no_coverage')).toBe(true);
  });

  it('sortScheduleRowsByRole группирует участников по роли и ФИО', () => {
    const mixedUsers: User[] = [
      { _id: 'u3', fullName: 'C', teamId: 't1', isActive: true, jobRole: 'backend' },
      { _id: 'u1', fullName: 'A', teamId: 't1', isActive: true, jobRole: 'frontend' },
      { _id: 'u2', fullName: 'B', teamId: 't1', isActive: true, jobRole: 'frontend' },
      { _id: 'u4', fullName: 'D', teamId: 't1', isActive: true },
    ];
    const rows = buildScheduleRows(mixedUsers, [], 2026, new Set());
    const sorted = sortScheduleRowsByRole(rows);
    expect(sorted.map((r) => r.user._id)).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('nonWorkingSegmentsForYear строит сегменты на шкале года', () => {
    const segments = nonWorkingSegmentsForYear(
      ['2026-01-01', '2026-01-02', '2026-06-12'],
      2026,
    );
    expect(segments).toHaveLength(2);
    expect(segments[0].widthPercent).toBeGreaterThan(0);
    expect(segments[1].leftPercent).toBeGreaterThan(segments[0].leftPercent);
  });
});
