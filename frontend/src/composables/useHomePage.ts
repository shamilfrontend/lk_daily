import { computed, ref, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useQueueStore } from '@/stores/queue';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { getApiErrorMessage } from '@/utils/apiError';
import { moscowTodayString, weekdayRu } from '@/utils/dates';

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
  const exportError = ref<string | null>(null);
  const linkCopied = ref(false);
  const skipWithoutRotation = ref(false);

  const today = moscowTodayString();
  let linkCopiedTimeoutId: ReturnType<typeof window.setTimeout> | null = null;

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

  const canAct = computed(() => {
    if (!auth.isAdmin) return false;
    const result = queue.current?.result;
    if (!result || result.kind !== 'ok') return false;
    if (queue.alreadyRecordedToday) return false;
    return true;
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
  const canExport = computed(() => hasSelectedTeam.value && !queue.loading);
  const canAdminAction = computed(() => canAct.value && !queue.loading);

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

  function formatUpcomingPresenter(row: { presenter?: { fullName: string } | null }): string {
    return row.presenter?.fullName ?? NO_AVAILABLE_PRESENTERS;
  }

  function downloadUpcomingCsv(): void {
    exportError.value = null;
    if (queue.upcoming.length === 0) {
      exportError.value = 'Нет данных для экспорта';
      return;
    }

    const rows = [
      ['Дата', 'День недели', 'Докладчик'],
      ...queue.upcoming.map((row) => [row.moscowDate, weekdayRu(row.moscowDate), formatUpcomingPresenter(row)]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const teamSlug = currentTeam.value?.name?.trim().replaceAll(/\s+/g, '-').toLowerCase() || 'team';

    link.href = url;
    link.download = `lk-daily-${teamSlug}-upcoming.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function buildApiHref(pathWithQuery: string): string {
    const base = import.meta.env.VITE_API_URL ?? '/api';
    if (base.startsWith('http')) {
      return `${base.replace(/\/$/, '')}${pathWithQuery}`;
    }
    return new URL(`${base.replace(/\/$/, '')}${pathWithQuery}`, window.location.origin).href;
  }

  function downloadUpcomingIcs(): void {
    exportError.value = null;
    const teamId = app.selectedTeamId;
    if (!teamId) {
      exportError.value = 'Команда не выбрана';
      return;
    }

    const href = buildApiHref(`/queue/upcoming/export/ics?teamId=${encodeURIComponent(teamId)}&days=${UPCOMING_DAYS}`);
    const link = document.createElement('a');

    link.href = href;
    link.rel = 'noopener';
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function copyTeamDeepLink(): Promise<void> {
    exportError.value = null;
    const teamId = app.selectedTeamId;
    if (!teamId) {
      exportError.value = 'Команда не выбрана';
      return;
    }

    try {
      const url = new URL(window.location.pathname, window.location.origin);
      url.searchParams.set('teamId', teamId);
      await navigator.clipboard.writeText(url.toString());

      if (linkCopiedTimeoutId) {
        window.clearTimeout(linkCopiedTimeoutId);
      }

      linkCopied.value = true;
      linkCopiedTimeoutId = window.setTimeout(() => {
        linkCopied.value = false;
        linkCopiedTimeoutId = null;
      }, 2000);
    } catch {
      exportError.value = 'Не удалось скопировать ссылку';
    }
  }

  return {
    actionError,
    alreadyRecordedHint,
    app,
    auth,
    canAdminAction,
    canExport,
    canRefresh,
    canAct,
    copyTeamDeepLink,
    currentTeam,
    downloadUpcomingCsv,
    downloadUpcomingIcs,
    exportError,
    formatUpcomingPresenter,
    headline,
    linkCopied,
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
