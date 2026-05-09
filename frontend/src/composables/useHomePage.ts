import { computed, ref, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useQueueStore } from '@/stores/queue';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { getApiErrorMessage } from '@/utils/apiError';
import { moscowTodayString } from '@/utils/dates';

const UPCOMING_DAYS = 7;
const NO_AVAILABLE_PRESENTERS = 'Нет доступных докладчиков';

export function useHomePage() {
  const app = useAppStore();
  const auth = useAuthStore();
  const queue = useQueueStore();
  const teams = useTeamsStore();
  const users = useUsersStore();

  const actionError = ref<string | null>(null);
  const pageError = ref<string | null>(null);
  const skipWithoutRotation = ref(false);

  const today = moscowTodayString();

  const currentTeam = computed(() => teams.teams.find((team) => team._id === app.selectedTeamId) ?? null);

  const userMap = computed(() => {
    const map = new Map<string, string>();
    for (const user of users.users) {
      map.set(user._id, user.fullName);
    }
    return map;
  });

  const onVacationToday = computed(() => new Set(queue.insightsToday?.vacationUserIds ?? []));
  const onMaternityLeaveIds = computed(() => new Set(queue.insightsToday?.maternityUserIds ?? []));

  const headline = computed(() => {
    const result = queue.current?.result;
    if (!result) return 'Загрузка…';
    if (result.kind === 'non_working') return 'Сегодня нерабочий день, созвона нет';
    if (result.kind === 'no_queue' || result.kind === 'no_available') return NO_AVAILABLE_PRESENTERS;
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

  const alreadyRecordedHint = computed(() => {
    if (!auth.isAdmin) return false;
    const result = queue.current?.result;
    return Boolean(result && result.kind === 'ok' && queue.alreadyRecordedToday);
  });

  const queueSize = computed(() => queue.order.length);
  const vacationCount = computed(() => onVacationToday.value.size);
  const nextPresenterCount = computed(() => queue.upcoming.length);

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

    try {
      await Promise.all([queue.loadAll(teamId, UPCOMING_DAYS), users.fetchUsers(teamId, false)]);
    } catch (error: unknown) {
      pageError.value =
        queue.error ?? users.error ?? getApiErrorMessage(error, 'Не удалось обновить главную страницу');
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
    } catch (error: unknown) {
      actionError.value = getApiErrorMessage(error, 'Не удалось отметить выступление');
    }
  }

  async function onSkip(): Promise<void> {
    const teamId = app.selectedTeamId;
    if (!teamId) return;

    actionError.value = null;
    try {
      await queue.skip(teamId, { rotate: !skipWithoutRotation.value });
    } catch (error: unknown) {
      actionError.value = getApiErrorMessage(error, 'Не удалось пропустить участника');
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
    queueSize,
    refresh,
    skipWithoutRotation,
    substitutionHint,
    today,
    userMap,
    vacationCount,
  };
}
