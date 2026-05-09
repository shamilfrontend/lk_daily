<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '@/api/client';
import AppDatePicker from '@/components/UI/AppDatePicker.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import type { HistoryRow, Team, User } from '@/types/api';
import { useTeamsStore } from '@/stores/teams';
import { getApiErrorMessage } from '@/utils/apiError';

const teams = useTeamsStore();

const filterTeamId = ref('');
const from = ref('');
const to = ref('');
const status = ref<'presented' | 'skipped' | 'no_available' | ''>('');
const rows = ref<HistoryRow[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 50;
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);

let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;

const resultCount = computed(() => total.value);
const shownCount = computed(() => rows.value.length);
const hasMore = computed(() => shownCount.value < total.value);

function statusLabel(value: HistoryRow['status']): string {
  if (value === 'presented') return 'Выступил';
  if (value === 'skipped') return 'Пропуск';
  if (value === 'no_available') return 'Нет доступных';
  return value;
}

function teamName(row: HistoryRow): string {
  const team = row.teamId;
  if (team && typeof team === 'object' && 'name' in team) {
    return (team as Team).name;
  }
  return String(team);
}

function userName(row: HistoryRow): string {
  const user = row.userId;
  if (user && typeof user === 'object' && 'fullName' in user) {
    return (user as User).fullName;
  }
  if (user === null || user === undefined) {
    return '—';
  }
  return String(user);
}

async function load(reset = true): Promise<void> {
  if (reset) {
    loading.value = true;
    page.value = 1;
    rows.value = [];
  } else {
    loadingMore.value = true;
  }
  error.value = null;
  try {
    const nextPage = reset ? 1 : page.value + 1;
    const { data } = await api.get<{ rows: HistoryRow[]; total: number; page: number; limit: number }>(
      '/history',
      {
        params: {
          teamId: filterTeamId.value || undefined,
          from: from.value || undefined,
          to: to.value || undefined,
          status: status.value || undefined,
          page: nextPage,
          limit,
        },
      },
    );
    total.value = data.total;
    page.value = data.page;
    rows.value = reset ? data.rows : [...rows.value, ...data.rows];
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить историю');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (!hasMore.value || loadingMore.value || loading.value) return;
  await load(false);
}

onMounted(async () => {
  try {
    await teams.fetchTeams();
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
  }
  await load();
});

watch([filterTeamId, from, to, status], () => {
  if (filterDebounceTimer !== undefined) {
    clearTimeout(filterDebounceTimer);
  }
  filterDebounceTimer = window.setTimeout(() => {
    filterDebounceTimer = undefined;
    void load(true);
  }, 400);
});

onBeforeUnmount(() => {
  if (filterDebounceTimer !== undefined) {
    clearTimeout(filterDebounceTimer);
  }
});
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="История"
      subtitle="Фильтруй журнал выступлений по команде, периоду и статусу без переходов на отдельные экраны."
    />

    <div class="card">
      <div class="toolbar">
        <div class="field field--grow">
          <label for="ft">Команда</label>
          <select id="ft" v-model="filterTeamId" class="select">
            <option value="">Все</option>
            <option v-for="team in teams.teams" :key="team._id" :value="team._id">{{ team.name }}</option>
          </select>
        </div>

        <div class="field field--sm">
          <label for="fr">С</label>
          <AppDatePicker id="fr" v-model="from" />
        </div>

        <div class="field field--sm">
          <label for="to">По</label>
          <AppDatePicker id="to" v-model="to" />
        </div>

        <div class="field field--grow">
          <label for="st">Статус</label>
          <select id="st" v-model="status" class="select">
            <option value="">Все</option>
            <option value="presented">Выступил</option>
            <option value="skipped">Пропуск</option>
            <option value="no_available">Нет доступных</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="history-head">
        <h2 class="history-head__title">Записи</h2>
        <p class="history-head__subtitle">
          Всего по фильтрам: {{ resultCount }}. На экране: {{ shownCount }}.
        </p>
      </div>

      <AppState
        v-if="loading"
        title="Загружаем историю"
        description="Применяем фильтры и собираем записи."
        compact
      />
      <AppState
        v-else-if="error"
        title="Не удалось загрузить историю"
        :description="error"
        tone="error"
      />
      <AppState
        v-else-if="rows.length === 0"
        title="По текущим фильтрам ничего не найдено"
        description="Попробуй расширить период или снять часть ограничений."
        tone="empty"
      />
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Команда</th>
              <th>Участник</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row._id">
              <td>{{ row.date.slice(0, 10) }}</td>
              <td>{{ teamName(row) }}</td>
              <td>{{ userName(row) }}</td>
              <td>{{ statusLabel(row.status) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="hasMore" class="history-more">
          <button type="button" class="btn" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? 'Загрузка…' : 'Загрузить ещё' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.history-more {
  margin-top: var(--space-3);
  display: flex;
  justify-content: center;
}

.history-head {
  margin-bottom: var(--space-3);
}

.history-head__title,
.history-head__subtitle {
  margin: 0;
}

.history-head__subtitle {
  margin-top: 0.35rem;
  color: var(--muted);
}
</style>
