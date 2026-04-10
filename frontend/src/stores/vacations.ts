import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { Vacation } from '@/types/api';

export const useVacationsStore = defineStore('vacations', () => {
  const vacations = ref<Vacation[]>([]);
  const loading = ref(false);

  async function fetchVacations(params: { userId?: string; teamId?: string }): Promise<void> {
    loading.value = true;
    try {
      const { data } = await api.get<Vacation[]>('/vacations', { params });
      vacations.value = data;
    } finally {
      loading.value = false;
    }
  }

  async function createVacation(payload: { userId: string; startDate: string; endDate: string }): Promise<Vacation> {
    const { data } = await api.post<Vacation>('/vacations', payload);
    return data;
  }

  async function updateVacation(
    id: string,
    payload: Partial<{ startDate: string; endDate: string }>,
  ): Promise<Vacation> {
    const { data } = await api.put<Vacation>(`/vacations/${id}`, payload);
    return data;
  }

  async function deleteVacation(id: string): Promise<void> {
    await api.delete(`/vacations/${id}`);
  }

  return { vacations, loading, fetchVacations, createVacation, updateVacation, deleteVacation };
});
