import { defineStore } from 'pinia';
import { ref } from 'vue';

import { api } from '@/api/client';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError } from '@/composables/useAppNotifications';

import type { HolidayTransferItem, NonWorkingItem } from '@/types/api';

export const useNonWorkingDaysStore = defineStore('nonWorkingDays', () => {
  const year = ref(new Date().getFullYear());
  const items = ref<NonWorkingItem[]>([]);
  const transfers = ref<HolidayTransferItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchYear(y: number, teamId?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [nwdRes, trRes] = await Promise.all([
        api.get<{ year: number; items: NonWorkingItem[] }>(
          '/non-working-days',
          {
            params: { year: y, teamId },
          },
        ),
        api.get<{ year: number; items: HolidayTransferItem[] }>(
          '/holiday-transfers',
          {
            params: { year: y },
          },
        ),
      ]);
      year.value = nwdRes.data.year;
      items.value = nwdRes.data.items;
      transfers.value = trRes.data.items;
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось загрузить календарь');
      notifyError(e, 'Не удалось загрузить календарь');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    year,
    items,
    transfers,
    loading,
    error,
    fetchYear,
  };
});
