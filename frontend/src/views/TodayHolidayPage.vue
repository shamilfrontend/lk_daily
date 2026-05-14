<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { api } from '@/api/client';
import AppButton from '@/components/UI/AppButton.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatCalendarDateTimeRu } from '@/utils/dates';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

import type { TodayHolidaysResponse } from '@/types/api';

interface CachedTodayHolidays {
  dateKey: string;
  items: string[];
  sourceUrl: string;
  fetchedAt: string;
}

const HOLIDAYS_CACHE_KEY = 'today-holidays-cache';

const isLoading = ref(false);
const error = ref<string | null>(null);
const items = ref<string[]>([]);
const sourceUrl = ref<string>('');
const fetchedAt = ref<string>('');
let nextDayRefreshTimeoutId: number | null = null;

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readTodayHolidaysCache(): CachedTodayHolidays | null {
  try {
    const raw = localStorage.getItem(HOLIDAYS_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CachedTodayHolidays>;
    if (
      typeof parsed.dateKey !== 'string' ||
      !Array.isArray(parsed.items) ||
      typeof parsed.sourceUrl !== 'string' ||
      typeof parsed.fetchedAt !== 'string'
    ) {
      return null;
    }
    return {
      dateKey: parsed.dateKey,
      items: parsed.items.filter((item): item is string => typeof item === 'string'),
      sourceUrl: parsed.sourceUrl,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

function writeTodayHolidaysCache(payload: CachedTodayHolidays): void {
  localStorage.setItem(HOLIDAYS_CACHE_KEY, JSON.stringify(payload));
}

function applyTodayHolidaysData(payload: Omit<CachedTodayHolidays, 'dateKey'>): void {
  items.value = payload.items;
  sourceUrl.value = payload.sourceUrl;
  fetchedAt.value = payload.fetchedAt;
}

async function loadTodayHolidays(silentSuccess = true): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const response = await api.get<TodayHolidaysResponse>('/today-holidays');
    const payload = {
      items: response.data.items,
      sourceUrl: response.data.sourceUrl,
      fetchedAt: response.data.fetchedAt,
    };
    applyTodayHolidaysData(payload);
    writeTodayHolidaysCache({
      dateKey: getTodayDateKey(),
      ...payload,
    });
    if (!silentSuccess) {
      notifySuccess('Праздники успешно обновлены');
    }
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить праздники');
    notifyError(e, 'Не удалось загрузить праздники');
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  const cached = readTodayHolidaysCache();
  if (cached && cached.dateKey === getTodayDateKey()) {
    applyTodayHolidaysData({
      items: cached.items,
      sourceUrl: cached.sourceUrl,
      fetchedAt: cached.fetchedAt,
    });
    return;
  }

  if (cached && cached.dateKey !== getTodayDateKey()) {
    localStorage.removeItem(HOLIDAYS_CACHE_KEY);
  }

  void loadTodayHolidays();

  const msUntilNextDay = (() => {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 0);
    return nextDay.getTime() - now.getTime();
  })();

  nextDayRefreshTimeoutId = window.setTimeout(() => {
    void loadTodayHolidays();
  }, msUntilNextDay + 1000);
});

onBeforeUnmount(() => {
  if (nextDayRefreshTimeoutId !== null) {
    window.clearTimeout(nextDayRefreshTimeoutId);
    nextDayRefreshTimeoutId = null;
  }
});
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Какой сегодня праздник?"
      subtitle="Список праздников на сегодня собирается автоматически с внешнего сайта."
		>
			<template #actions>
				<AppButton
					type="button"
					:disabled="isLoading"
					@click="loadTodayHolidays(false)"
				>
					{{ isLoading ? 'Обновляем...' : 'Обновить данные' }}
				</AppButton>
			</template>
		</AppPageHeader>

    <AppState
      v-if="error"
      title="Не удалось загрузить праздники"
      :description="error"
      tone="error"
    >
      <template #actions>
        <AppButton
          type="button"
          variant="primary"
          :disabled="isLoading"
          @click="loadTodayHolidays(false)"
        >
          Повторить
        </AppButton>
      </template>
    </AppState>

    <div v-else class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">Праздники текущего дня</h2>
          <p class="card-heading__subtitle">
            Источник: {{ sourceUrl || 'kakoysegodnyaprazdnik.ru' }}
          </p>
        </div>
      </div>

      <div
        v-if="isLoading"
        class="holiday-loader"
        role="status"
        aria-live="polite"
        aria-label="Загружаем праздники"
      >
        <span class="holiday-loader__spinner" aria-hidden="true"></span>
        <span class="holiday-loader__text">Загружаем праздники...</span>
      </div>

      <AppState
        v-else-if="!items.length"
        title="Праздники не найдены"
        description="Источник не вернул записей за текущий день."
        tone="empty"
      />

      <ul v-else class="holiday-list">
        <li v-for="item in items" :key="item" class="holiday-list__item">
          {{ item }}
        </li>
      </ul>

      <p v-if="fetchedAt" class="holiday-meta">
        Обновлено: {{ formatCalendarDateTimeRu(fetchedAt) }}
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.card-heading__title,
.card-heading__subtitle {
  margin: 0;
}

.card-heading__subtitle {
  margin-top: 0.35rem;
  color: var(--muted);
}

.holiday-loader {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 0;
  color: var(--muted);
}

.holiday-loader__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(148, 163, 184, 0.35);
  border-top-color: rgba(16, 185, 129, 0.95);
  border-radius: 50%;
  animation: holiday-spin 0.9s linear infinite;
}

.holiday-loader__text {
  font-size: 0.95rem;
}

.holiday-list {
  margin: 16px 0 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 0.45rem;
  grid-template-columns: 1fr;
}

.holiday-list__item {
  line-height: 1.45;
}

.holiday-meta {
  margin-top: 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}

@keyframes holiday-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
