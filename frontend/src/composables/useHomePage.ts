import { computed, ref, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useQueueStore } from '@/stores/queue';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  formatCalendarDateRu,
  formatVacationRangeShortRu,
  moscowTodayString,
} from '@/utils/dates';
import { notifySuccess } from '@/composables/useAppNotifications';
import type { QueueMember, User } from '@/types/api';
import { isUserOnMaternityLeave } from '@/utils/vacationSchedule';

const UPCOMING_DAYS = 60;
const UPCOMING_BIRTHDAY_DAYS = 30;
const UPCOMING_VACATION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_AVAILABLE_PRESENTERS = 'Нет доступных докладчиков';

interface UpcomingBirthdayRow {
  userId: string;
  fullName: string;
  dayMonth: string;
  daysLeft: number;
}

interface UpcomingVacationRow {
  vacationId: string;
  userId: string;
  fullName: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
  isOngoing: boolean;
}

function addDaysToYmd(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildUpcomingBirthdayDate(
  birthdayRaw: string | undefined,
  todayUtc: Date,
): { isoDate: string; daysLeft: number } | null {
  if (!birthdayRaw) return null;
  const birthdayDate = new Date(birthdayRaw);
  if (Number.isNaN(birthdayDate.getTime())) return null;

  const month = birthdayDate.getUTCMonth();
  const day = birthdayDate.getUTCDate();
  const thisYear = todayUtc.getUTCFullYear();

  const thisYearBirthday = new Date(Date.UTC(thisYear, month, day));
  const targetDate =
    thisYearBirthday < todayUtc
      ? new Date(Date.UTC(thisYear + 1, month, day))
      : thisYearBirthday;
  const daysLeft = Math.round(
    (targetDate.getTime() - todayUtc.getTime()) / DAY_MS,
  );

  if (daysLeft < 0 || daysLeft > UPCOMING_BIRTHDAY_DAYS) {
    return null;
  }

  const targetIso = targetDate.toISOString().slice(0, 10);
  return { isoDate: targetIso, daysLeft };
}

export function useHomePage() {
  const app = useAppStore();
  const auth = useAuthStore();
  const queue = useQueueStore();
  const teams = useTeamsStore();
  const users = useUsersStore();
  const vacations = useVacationsStore();

  const actionError = ref<string | null>(null);
  const pageError = ref<string | null>(null);
  const today = moscowTodayString();
  const todayUtcDate = new Date(`${today}T00:00:00.000Z`);

  const currentTeam = computed(
    () => teams.teams.find((team) => team._id === app.selectedTeamId) ?? null,
  );

  const userMap = computed(() => {
    const map = new Map<string, string>();
    for (const user of users.users) {
      map.set(user._id, user.fullName);
    }
    return map;
  });

  const userById = computed(() => {
    const map = new Map<string, User>();
    for (const user of users.users) {
      map.set(user._id, user);
    }
    return map;
  });

  const currentPresenterUser = computed(() => {
    const result = queue.current?.result;
    if (!result || result.kind !== 'ok') return null;
    return userById.value.get(result.user._id) ?? null;
  });

  const queueDateByUserId = computed(() => {
    const map = new Map<string, string>();
    for (const row of queue.upcoming) {
      const presenterId = row.presenter?._id;
      if (!presenterId || map.has(presenterId)) continue;
      map.set(presenterId, formatCalendarDateRu(row.moscowDate));
    }
    return map;
  });

  const onVacationToday = computed(
    () => new Set(queue.insightsToday?.vacationUserIds ?? []),
  );
  const onMaternityLeaveIds = computed(
    () => new Set(queue.insightsToday?.maternityUserIds ?? []),
  );
  const onSickLeaveIds = computed(
    () => new Set(queue.insightsToday?.sickLeaveUserIds ?? []),
  );

  const headline = computed(() => {
    const result = queue.current?.result;
    if (!result) return 'Загрузка…';
    if (result.kind === 'non_working')
      return 'Сегодня нерабочий день, созвона нет';
    if (result.kind === 'no_queue' || result.kind === 'no_available')
      return NO_AVAILABLE_PRESENTERS;
    return result.user.fullName;
  });

  const nonWorkingReason = computed(() => {
    const result = queue.current?.result;
    return result?.kind === 'non_working' ? result.reason : null;
  });

  const substitutionHint = computed(() => {
    const result = queue.current?.result;
    if (result?.kind === 'ok' && result.substitution) {
      return `Подмена вместо ${result.substitution.canonicalFullName}`;
    }
    return null;
  });

  const presenterSelectionHint = computed(() => {
    const result = queue.current?.result;
    if (result?.kind !== 'ok' || result.substitution) {
      return null;
    }
    const debt = result.canonicalSkipDebt ?? 0;
    if (debt > 0) {
      return `Приоритет по пропускам: ${debt}`;
    }
    return 'По очереди';
  });

  const skipDebtByUserId = computed(() => {
    const map = new Map<string, number>();
    for (const m of queue.queueMembers) {
      const debt = m.skipDebt ?? 0;
      if (debt > 0) {
        map.set(m.userId, debt);
      }
    }
    return map;
  });

  const alreadyRecordedHint = computed(() => {
    if (!auth.isAdmin) return false;
    const result = queue.current?.result;
    return Boolean(
      result && result.kind === 'ok' && queue.alreadyRecordedToday,
    );
  });

  const queueSize = computed(
    () => queue.queueMembers.filter((m) => m.active).length,
  );
  const vacationCount = computed(() => onVacationToday.value.size);

  /** Участники, которых показываем в блоке «Текущая очередь» на «Сегодня». */
  const visibleQueueMembersToday = computed<QueueMember[]>(() =>
    queue.queueMembers.filter(
      (m) =>
        m.active &&
        !onVacationToday.value.has(m.userId) &&
        !onMaternityLeaveIds.value.has(m.userId) &&
        !onSickLeaveIds.value.has(m.userId),
    ),
  );

  const queueHasOnlyHiddenMembersToday = computed(
    () =>
      queue.queueMembers.length > 0 &&
      visibleQueueMembersToday.value.length === 0,
  );

  const nextPresenterCount = computed(() => queue.upcoming.length);

  const upcomingBirthdays = computed<UpcomingBirthdayRow[]>(() => {
    const rows: UpcomingBirthdayRow[] = [];
    for (const user of users.users) {
      const upcoming = buildUpcomingBirthdayDate(user.birthday, todayUtcDate);
      if (!upcoming) continue;
      rows.push({
        userId: user._id,
        fullName: user.fullName,
        dayMonth: formatCalendarDateRu(upcoming.isoDate),
        daysLeft: upcoming.daysLeft,
      });
    }
    return rows.sort((a, b) => {
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      return a.fullName.localeCompare(b.fullName, 'ru');
    });
  });

  const todayBirthdays = computed(() =>
    upcomingBirthdays.value.filter((item) => item.daysLeft === 0),
  );

  const upcomingBirthdaysNextMonth = computed(() =>
    upcomingBirthdays.value.filter((item) => item.daysLeft > 0),
  );

  const upcomingVacations = computed<UpcomingVacationRow[]>(() => {
    const teamId = app.selectedTeamId;
    if (!teamId) return [];

    const nameByUserId = new Map(
      users.users
        .filter(
          (user) =>
            user.teamId === teamId && !isUserOnMaternityLeave(user),
        )
        .map((user) => [user._id, user.fullName]),
    );

    const rows: UpcomingVacationRow[] = [];
    for (const vacation of vacations.vacations) {
      const fullName = nameByUserId.get(vacation.userId);
      if (!fullName) continue;
      if (vacation.endDate < today) continue;

      const isOngoing =
        vacation.startDate <= today && vacation.endDate >= today;
      rows.push({
        vacationId: vacation._id,
        userId: vacation.userId,
        fullName,
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        periodLabel: formatVacationRangeShortRu(
          vacation.startDate,
          vacation.endDate,
        ),
        isOngoing,
      });
    }

    return rows.sort((a, b) => {
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
      return a.fullName.localeCompare(b.fullName, 'ru');
    });
  });

  const ongoingVacationRows = computed(() =>
    upcomingVacations.value.filter((row) => row.isOngoing),
  );

  const upcomingVacationsSoon = computed(() =>
    upcomingVacations.value.filter((row) => !row.isOngoing),
  );

  const hasSelectedTeam = computed(() => Boolean(app.selectedTeamId));
  const canRefresh = computed(() => hasSelectedTeam.value && !queue.loading);

  const canAdminAction = computed(() => {
    if (!auth.isAdmin) return false;
    const result = queue.current?.result;
    if (!result || result.kind !== 'ok') return false;
    if (queue.alreadyRecordedToday) return false;
    return !queue.loading;
  });

  async function refresh(): Promise<void> {
    actionError.value = null;
    pageError.value = null;
    const teamId = app.selectedTeamId;
    if (!teamId) return;

    const toDate = addDaysToYmd(today, UPCOMING_VACATION_DAYS);

    try {
      await Promise.all([
        queue.loadAll(teamId, UPCOMING_DAYS),
        users.fetchUsersAllAccessibleTeams(false),
        vacations.fetchVacations({ teamId, fromDate: today, toDate }),
      ]);
    } catch (error: unknown) {
      pageError.value =
        queue.error ??
        users.error ??
        vacations.error ??
        getApiErrorMessage(error, 'Не удалось обновить главную страницу');
    }
  }

  watch(
    () => app.selectedTeamId,
    () => {
      void refresh();
    },
    { immediate: true },
  );

  async function onPresent(): Promise<void> {
    const teamId = app.selectedTeamId;
    if (!teamId) return;

    actionError.value = null;
    try {
      await queue.present(teamId);
      notifySuccess('Выступление отмечено');
    } catch (error: unknown) {
      actionError.value = getApiErrorMessage(
        error,
        'Не удалось отметить выступление',
      );
    }
  }

  async function onSkip(): Promise<void> {
    const teamId = app.selectedTeamId;
    if (!teamId) return;

    actionError.value = null;
    try {
      await queue.skip(teamId, UPCOMING_DAYS);
      notifySuccess('Показан следующий докладчик');
    } catch (error: unknown) {
      actionError.value = getApiErrorMessage(
        error,
        'Не удалось пропустить участника',
      );
    }
  }

  return {
    actionError,
    alreadyRecordedHint,
    app,
    auth,
    canAdminAction,
    canRefresh,
    currentTeam,
    headline,
    nextPresenterCount,
    nonWorkingReason,
    onMaternityLeaveIds,
    onPresent,
    onSkip,
    onVacationToday,
    pageError,
    queue,
    queueHasOnlyHiddenMembersToday,
    queueSize,
    refresh,
    presenterSelectionHint,
    skipDebtByUserId,
    substitutionHint,
    todayBirthdays,
    currentPresenterUser,
    userById,
    today,
    ongoingVacationRows,
    upcomingBirthdays,
    upcomingBirthdaysNextMonth,
    upcomingVacations,
    upcomingVacationsSoon,
    queueDateByUserId,
    userMap,
    vacationCount,
    visibleQueueMembersToday,
  };
}
