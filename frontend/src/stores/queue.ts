import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type {
  CurrentPresenterResult,
  QueueInsightsToday,
  QueueSubstitutionRow,
  UpcomingRow,
} from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

export const useQueueStore = defineStore('queue', () => {
  const current = ref<{ teamId: string; result: CurrentPresenterResult } | null>(null);
  /** За текущую московскую дату для команды уже есть запись в логе выступлений */
  const alreadyRecordedToday = ref(false);
  const insightsToday = ref<QueueInsightsToday | null>(null);
  const order = ref<string[]>([]);
  const upcoming = ref<UpcomingRow[]>([]);
  const substitutions = ref<QueueSubstitutionRow[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadAll(teamId: string, upcomingDays = 7): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [c, o, u, s] = await Promise.all([
        api.get<{
          teamId: string;
          result: CurrentPresenterResult;
          insights: QueueInsightsToday;
          alreadyRecordedToday?: boolean;
        }>('/queue/current', { params: { teamId } }),
        api.get<{ teamId: string; userIds: string[] }>('/queue/order', { params: { teamId } }),
        api.get<{ teamId: string; days: number; rows: UpcomingRow[] }>('/queue/upcoming', {
          params: { teamId, days: upcomingDays },
        }),
        api.get<{ teamId: string; rows: QueueSubstitutionRow[] }>('/queue/substitutions', { params: { teamId } }),
      ]);
      current.value = { teamId: c.data.teamId, result: c.data.result };
      alreadyRecordedToday.value = c.data.alreadyRecordedToday === true;
      insightsToday.value = c.data.insights ?? { vacationUserIds: [], maternityUserIds: [] };
      order.value = o.data.userIds;
      upcoming.value = u.data.rows;
      substitutions.value = s.data.rows;
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось загрузить очередь');
      notifyError(e, 'Не удалось загрузить очередь');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function present(teamId: string): Promise<void> {
    loading.value = true;
    try {
      await api.post('/queue/present', {}, { params: { teamId } });
      await loadAll(teamId);
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось отметить выступление');
      notifyError(e, 'Не удалось отметить выступление');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function skip(teamId: string, options?: { rotate?: boolean }): Promise<void> {
    loading.value = true;
    try {
      await api.post('/queue/skip', { rotate: options?.rotate !== false }, { params: { teamId } });
      await loadAll(teamId);
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось пропустить участника');
      notifyError(e, 'Не удалось пропустить участника');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function saveOrder(teamId: string, userIds: string[]): Promise<void> {
    error.value = null;
    try {
      await api.put('/queue/order', { userIds }, { params: { teamId } });
      await loadAll(teamId);
      notifySuccess('Порядок очереди сохранен');
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось сохранить порядок');
      notifyError(e, 'Не удалось сохранить порядок');
      throw e;
    }
  }

  async function fetchSubstitutions(teamId: string): Promise<void> {
    try {
      const { data } = await api.get<{ teamId: string; rows: QueueSubstitutionRow[] }>('/queue/substitutions', {
        params: { teamId },
      });
      substitutions.value = data.rows;
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось загрузить подмены');
      notifyError(e, 'Не удалось загрузить подмены');
      throw e;
    }
  }

  async function saveSubstitution(teamId: string, moscowDate: string, substituteUserId: string): Promise<void> {
    try {
      await api.post('/queue/substitutions', { teamId, moscowDate, substituteUserId });
      await fetchSubstitutions(teamId);
      notifySuccess('Подмена на день сохранена');
    } catch (e) {
      notifyError(e, 'Не удалось сохранить подмену');
      throw e;
    }
  }

  async function deleteSubstitution(teamId: string, moscowDate: string): Promise<void> {
    try {
      await api.delete('/queue/substitutions', { params: { teamId, moscowDate } });
      await fetchSubstitutions(teamId);
      notifySuccess('Подмена удалена');
    } catch (e) {
      notifyError(e, 'Не удалось удалить подмену');
      throw e;
    }
  }

  async function swapSubstitutionDays(teamId: string, moscowDateA: string, moscowDateB: string): Promise<void> {
    try {
      await api.post('/queue/substitutions/swap-days', { teamId, moscowDateA, moscowDateB });
      await loadAll(teamId);
      notifySuccess('Подмены между датами применены');
    } catch (e) {
      notifyError(e, 'Не удалось поменять подмены');
      throw e;
    }
  }

  async function sortAlphabetical(teamId: string): Promise<void> {
    error.value = null;
    try {
      await api.post('/queue/sort-alphabetically', {}, { params: { teamId } });
      await loadAll(teamId);
      notifySuccess('Очередь отсортирована по алфавиту');
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось отсортировать очередь');
      notifyError(e, 'Не удалось отсортировать очередь');
      throw e;
    }
  }

  return {
    current,
    alreadyRecordedToday,
    insightsToday,
    order,
    upcoming,
    substitutions,
    loading,
    error,
    loadAll,
    present,
    skip,
    saveOrder,
    sortAlphabetical,
    fetchSubstitutions,
    saveSubstitution,
    deleteSubstitution,
    swapSubstitutionDays,
  };
});
