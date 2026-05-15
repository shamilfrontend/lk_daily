import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  USER_JOB_ROLES,
  type UserJobRole,
} from '@/constants/userJobRoles';
import { useAppStore } from '@/stores/app';
import { useNonWorkingDaysStore } from '@/stores/nonWorkingDays';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';
import {
  assessLaborVacationCompliance,
  type LaborVacationCompliance,
} from '@/utils/vacationLaborCompliance';
import {
  buildSameRoleConflictRanges,
  buildScheduleRows,
  sortScheduleRowsByRole,
  detectSameRoleConflictDays,
  monthsWithConflictDays,
  nonWorkingSegmentsForYear,
  yearDateRange,
  type ConflictRange,
  type ScheduleParticipantRow,
  type TimelineSegment,
  type VacationBarSegment,
} from '@/utils/vacationSchedule';

import type { User } from '@/types/api';

function parseYearFromQuery(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return null;
  const y = Number(value);
  if (y < 1970 || y > 2100) return null;
  return y;
}

function parseRolesFromQuery(value: unknown): Set<UserJobRole> {
  const result = new Set<UserJobRole>();
  if (typeof value !== 'string' || !value.trim()) return result;
  for (const part of value.split(',')) {
    const role = part.trim() as UserJobRole;
    if ((USER_JOB_ROLES as readonly string[]).includes(role)) {
      result.add(role);
    }
  }
  return result;
}

export interface SelectedVacationBar {
  bar: VacationBarSegment;
  user: User;
}

export function useVacationSchedule() {
  const app = useAppStore();
  const usersStore = useUsersStore();
  const vacationsStore = useVacationsStore();
  const nwdStore = useNonWorkingDaysStore();
  const route = useRoute();
  const router = useRouter();

  const initialYear = parseYearFromQuery(route.query.year);
  const year = ref(initialYear ?? new Date().getFullYear());
  const roleFilter = ref<Set<UserJobRole>>(parseRolesFromQuery(route.query.role));
  const showOnlyConflicts = ref(false);
  const showOnlyLaborIssues = ref(false);
  const loadError = ref<string | null>(null);
  const highlightedUserIds = ref<Set<string>>(new Set());
  const selectedBar = ref<SelectedVacationBar | null>(null);
  const syncingFromRoute = ref(false);

  const teamId = computed(() => app.selectedTeamId ?? '');

  const conflictDays = computed(() =>
    detectSameRoleConflictDays(
      usersStore.users,
      vacationsStore.vacations,
      year.value,
    ),
  );

  const conflictMonths = computed(() =>
    monthsWithConflictDays(conflictDays.value, year.value),
  );

  const conflictRanges = computed<ConflictRange[]>(() =>
    buildSameRoleConflictRanges(
      usersStore.users,
      vacationsStore.vacations,
      year.value,
    ),
  );

  const nonWorkingSegments = computed<TimelineSegment[]>(() =>
    nonWorkingSegmentsForYear(
      nwdStore.items.map((item) => item.date),
      year.value,
    ),
  );

  const complianceByUserId = computed(() => {
    const map = new Map<string, LaborVacationCompliance>();
    for (const user of usersStore.users) {
      map.set(
        user._id,
        assessLaborVacationCompliance(
          user._id,
          vacationsStore.vacations,
          year.value,
        ),
      );
    }
    return map;
  });

  const allRows = computed<ScheduleParticipantRow[]>(() =>
    sortScheduleRowsByRole(
      buildScheduleRows(
        usersStore.users,
        vacationsStore.vacations,
        year.value,
        conflictDays.value,
      ),
    ),
  );

  const visibleRows = computed(() => {
    let rows = allRows.value;
    if (roleFilter.value.size > 0) {
      rows = rows.filter(
        (row) => row.user.jobRole && roleFilter.value.has(row.user.jobRole),
      );
    }
    if (showOnlyConflicts.value) {
      rows = rows.filter((row) => row.bars.some((bar) => bar.hasConflict));
    }
    if (showOnlyLaborIssues.value) {
      rows = rows.filter((row) => {
        const compliance = complianceByUserId.value.get(row.user._id);
        return compliance && !compliance.isCompliant && compliance.periodCount > 0;
      });
    }
    return sortScheduleRowsByRole(rows);
  });

  const isLoading = computed(
    () => usersStore.loading || vacationsStore.loading,
  );

  const emptyStateDescription = computed(() => {
    if (showOnlyLaborIssues.value) {
      return 'Нет участников с нарушениями нормы ТК (28 дн., один период ≥14) в выбранном году.';
    }
    if (showOnlyConflicts.value) {
      return 'Нет периодов с пересечением по роли в выбранном году.';
    }
    if (roleFilter.value.size > 0) {
      return 'Добавьте участников в команду или сбросьте фильтр по роли.';
    }
    return 'Добавьте участников в команду.';
  });

  async function load(): Promise<void> {
    if (!teamId.value) {
      usersStore.users = [];
      vacationsStore.vacations = [];
      return;
    }
    loadError.value = null;
    const { fromDate, toDate } = yearDateRange(year.value);
    const usersPromise = usersStore.fetchUsers(teamId.value);
    const vacationsPromise = vacationsStore.fetchVacations({
      teamId: teamId.value,
      fromDate,
      toDate,
    });
    const nwdPromise = nwdStore.fetchYear(year.value, teamId.value).catch(() => {
      /* график отпусков не блокируем при ошибке NWD */
    });

    try {
      await Promise.all([usersPromise, vacationsPromise, nwdPromise]);
    } catch {
      loadError.value =
        vacationsStore.error ??
        usersStore.error ??
        'Не удалось загрузить график отпусков';
    }
  }

  function setYear(next: number): void {
    year.value = next;
    selectedBar.value = null;
    highlightedUserIds.value = new Set();
  }

  function toggleRoleFilter(role: UserJobRole): void {
    const next = new Set(roleFilter.value);
    if (next.has(role)) {
      next.delete(role);
    } else {
      next.add(role);
    }
    roleFilter.value = next;
  }

  function clearRoleFilter(): void {
    roleFilter.value = new Set();
  }

  function focusConflictParticipants(userIds: string[]): void {
    highlightedUserIds.value = new Set(userIds);
    selectedBar.value = null;
  }

  function selectBar(payload: SelectedVacationBar): void {
    selectedBar.value = payload;
    highlightedUserIds.value = new Set([payload.user._id]);
  }

  function clearSelectedBar(): void {
    selectedBar.value = null;
  }

  function applyRouteQuery(): void {
    const queryYear = parseYearFromQuery(route.query.year);
    if (queryYear !== null) {
      year.value = queryYear;
    }
    roleFilter.value = parseRolesFromQuery(route.query.role);
  }

  function syncRouteQuery(): void {
    const nextRole =
      roleFilter.value.size > 0
        ? [...roleFilter.value].sort().join(',')
        : undefined;
    const nextYear = String(year.value);
    const currentYear = route.query.year;
    const currentRole = route.query.role;
    if (currentYear === nextYear && currentRole === nextRole) {
      return;
    }
    syncingFromRoute.value = true;
    void router
      .replace({
        query: {
          year: nextYear,
          ...(nextRole ? { role: nextRole } : {}),
        },
      })
      .finally(() => {
        syncingFromRoute.value = false;
      });
  }

  watch(
    () => route.query,
    () => {
      if (syncingFromRoute.value) return;
      applyRouteQuery();
    },
  );

  watch([year, roleFilter], () => {
    if (!syncingFromRoute.value) {
      syncRouteQuery();
    }
  });

  watch(
    [teamId, year],
    () => {
      void load();
    },
    { immediate: true },
  );

  return {
    year,
    teamId,
    roleFilter,
    showOnlyConflicts,
    showOnlyLaborIssues,
    complianceByUserId,
    loadError,
    conflictDays,
    conflictMonths,
    conflictRanges,
    nonWorkingSegments,
    allRows,
    visibleRows,
    isLoading,
    highlightedUserIds,
    selectedBar,
    emptyStateDescription,
    load,
    setYear,
    toggleRoleFilter,
    clearRoleFilter,
    focusConflictParticipants,
    selectBar,
    clearSelectedBar,
  };
}
