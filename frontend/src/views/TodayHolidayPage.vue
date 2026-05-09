<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '@/api/client';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import type { TodayHolidaysResponse } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

const AUTO_REFRESH_MS = 5 * 60 * 1000;

const isLoading = ref(false);
const error = ref<string | null>(null);
const items = ref<string[]>([]);
const sourceUrl = ref<string>('');
const fetchedAt = ref<string>('');
let refreshTimerId: number | null = null;

async function loadTodayHolidays(silentSuccess = true): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const response = await api.get<TodayHolidaysResponse>('/today-holidays');
    items.value = response.data.items;
    sourceUrl.value = response.data.sourceUrl;
    fetchedAt.value = response.data.fetchedAt;
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
  void loadTodayHolidays();
  refreshTimerId = window.setInterval(() => {
    void loadTodayHolidays();
  }, AUTO_REFRESH_MS);
});

onBeforeUnmount(() => {
  if (refreshTimerId !== null) {
    window.clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
});
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Какой сегодня праздник?"
      subtitle="Список праздников на сегодня собирается автоматически с внешнего сайта."
    />

    <AppState
      v-if="error"
      title="Не удалось загрузить праздники"
      :description="error"
      tone="error"
    >
      <template #actions>
        <button type="button" class="btn btn--primary" :disabled="isLoading" @click="loadTodayHolidays(false)">
          Повторить
        </button>
      </template>
    </AppState>

    <div v-else class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">Праздники текущего дня</h2>
          <p class="card-heading__subtitle">Источник: {{ sourceUrl || 'kakoysegodnyaprazdnik.ru' }}</p>
        </div>
        <button type="button" class="btn holiday-refresh-btn" :disabled="isLoading" @click="loadTodayHolidays(false)">
          {{ isLoading ? 'Обновляем...' : 'Обновить' }}
        </button>
      </div>

      <div v-if="isLoading" class="holiday-loader" role="status" aria-live="polite" aria-label="Загружаем праздники">
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

      <p v-if="fetchedAt" class="holiday-meta">Обновлено: {{ new Date(fetchedAt).toLocaleString('ru-RU') }}</p>
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

.holiday-refresh-btn {
  margin: 16px 0;
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
  margin: 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 0.45rem;
	grid-template-columns: repeat(2, 1fr);
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
