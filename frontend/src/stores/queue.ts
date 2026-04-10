import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { CurrentPresenterResult, UpcomingRow } from '@/types/api';

export const useQueueStore = defineStore('queue', () => {
  const current = ref<{ teamId: string; result: CurrentPresenterResult } | null>(null);
  const order = ref<string[]>([]);
  const upcoming = ref<UpcomingRow[]>([]);
  const loading = ref(false);

  async function loadAll(teamId: string, upcomingDays = 7): Promise<void> {
    loading.value = true;
    try {
      const [c, o, u] = await Promise.all([
        api.get<{ teamId: string; result: CurrentPresenterResult }>('/queue/current', { params: { teamId } }),
        api.get<{ teamId: string; userIds: string[] }>('/queue/order', { params: { teamId } }),
        api.get<{ teamId: string; days: number; rows: UpcomingRow[] }>('/queue/upcoming', {
          params: { teamId, days: upcomingDays },
        }),
      ]);
      current.value = c.data;
      order.value = o.data.userIds;
      upcoming.value = u.data.rows;
    } finally {
      loading.value = false;
    }
  }

  async function present(teamId: string): Promise<void> {
    await api.post('/queue/present', null, { params: { teamId } });
    await loadAll(teamId);
  }

  async function skip(teamId: string): Promise<void> {
    await api.post('/queue/skip', null, { params: { teamId } });
    await loadAll(teamId);
  }

  async function saveOrder(teamId: string, userIds: string[]): Promise<void> {
    await api.put('/queue/order', { userIds }, { params: { teamId } });
    await loadAll(teamId);
  }

  async function sortAlphabetical(teamId: string): Promise<void> {
    await api.post('/queue/sort-alphabetically', null, { params: { teamId } });
    await loadAll(teamId);
  }

  return { current, order, upcoming, loading, loadAll, present, skip, saveOrder, sortAlphabetical };
});
