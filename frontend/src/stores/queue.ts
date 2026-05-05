import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { CurrentPresenterResult, QueueSubstitutionRow, UpcomingRow } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';

export const useQueueStore = defineStore('queue', () => {
  const current = ref<{ teamId: string; result: CurrentPresenterResult } | null>(null);
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
        api.get<{ teamId: string; result: CurrentPresenterResult }>('/queue/current', { params: { teamId } }),
        api.get<{ teamId: string; userIds: string[] }>('/queue/order', { params: { teamId } }),
        api.get<{ teamId: string; days: number; rows: UpcomingRow[] }>('/queue/upcoming', {
          params: { teamId, days: upcomingDays },
        }),
        api.get<{ teamId: string; rows: QueueSubstitutionRow[] }>('/queue/substitutions', { params: { teamId } }),
      ]);
      current.value = c.data;
      order.value = o.data.userIds;
      upcoming.value = u.data.rows;
      substitutions.value = s.data.rows;
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось загрузить очередь');
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
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function skip(teamId: string): Promise<void> {
    loading.value = true;
    try {
      await api.post('/queue/skip', {}, { params: { teamId } });
      await loadAll(teamId);
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось пропустить участника');
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
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось сохранить порядок');
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
      throw e;
    }
  }

  async function saveSubstitution(teamId: string, moscowDate: string, substituteUserId: string): Promise<void> {
    await api.post('/queue/substitutions', { teamId, moscowDate, substituteUserId });
    await fetchSubstitutions(teamId);
  }

  async function deleteSubstitution(teamId: string, moscowDate: string): Promise<void> {
    await api.delete('/queue/substitutions', { params: { teamId, moscowDate } });
    await fetchSubstitutions(teamId);
  }

  async function sortAlphabetical(teamId: string): Promise<void> {
    error.value = null;
    try {
      await api.post('/queue/sort-alphabetically', {}, { params: { teamId } });
      await loadAll(teamId);
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось отсортировать очередь');
      throw e;
    }
  }

  return {
    current,
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
  };
});
