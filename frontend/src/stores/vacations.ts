import { defineStore } from 'pinia';
import { ref } from 'vue';

import { api } from '@/api/client';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

import type { Vacation } from '@/types/api';

export const useVacationsStore = defineStore('vacations', () => {
  const vacations = ref<Vacation[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchVacations(params: {
    userId?: string;
    teamId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<Vacation[]>('/vacations', { params });
      vacations.value = data;
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось загрузить отпуска');
      notifyError(e, 'Не удалось загрузить отпуска');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createVacation(payload: {
    userId: string;
    startDate: string;
    endDate: string;
  }): Promise<Vacation> {
    try {
      const { data } = await api.post<Vacation>('/vacations', payload);
      notifySuccess('Период отпуска добавлен');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось сохранить отпуск');
      throw e;
    }
  }

  async function updateVacation(
    id: string,
    payload: Partial<{ startDate: string; endDate: string }>,
  ): Promise<Vacation> {
    try {
      const { data } = await api.put<Vacation>(`/vacations/${id}`, payload);
      notifySuccess('Период отпуска обновлен');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось сохранить отпуск');
      throw e;
    }
  }

  async function deleteVacation(id: string): Promise<void> {
    try {
      await api.delete(`/vacations/${id}`);
      notifySuccess('Период отпуска удален');
    } catch (e) {
      notifyError(e, 'Не удалось удалить отпуск');
      throw e;
    }
  }

  return {
    vacations,
    loading,
    error,
    fetchVacations,
    createVacation,
    updateVacation,
    deleteVacation,
  };
});
