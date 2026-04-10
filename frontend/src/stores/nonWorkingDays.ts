import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { NonWorkingItem } from '@/types/api';

export const useNonWorkingDaysStore = defineStore('nonWorkingDays', () => {
  const year = ref(new Date().getFullYear());
  const items = ref<NonWorkingItem[]>([]);
  const loading = ref(false);

  async function fetchYear(y: number): Promise<void> {
    loading.value = true;
    try {
      const { data } = await api.get<{ year: number; items: NonWorkingItem[] }>('/non-working-days', {
        params: { year: y },
      });
      year.value = data.year;
      items.value = data.items;
    } finally {
      loading.value = false;
    }
  }

  async function createCustom(date: string, description?: string): Promise<void> {
    await api.post('/non-working-days', { date, description });
    await fetchYear(year.value);
  }

  async function removeCustom(id: string): Promise<void> {
    await api.delete(`/non-working-days/${id}`);
    await fetchYear(year.value);
  }

  return { year, items, loading, fetchYear, createCustom, removeCustom };
});
