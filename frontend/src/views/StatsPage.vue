<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppDatePicker from '@/components/UI/AppDatePicker.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import type { TeamStatsResponse } from '@/types/api';
import { useAppStore } from '@/stores/app';
import { api } from '@/api/client';
import { useTeamsStore } from '@/stores/teams';
import { getApiErrorMessage } from '@/utils/apiError';

const teams = useTeamsStore();
const app = useAppStore();

const teamId = ref('');
const from = ref('');
const to = ref('');
const stats = ref<TeamStatsResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const selectedTeamName = computed(() => teams.teams.find((t) => t._id === teamId.value)?.name ?? '');

async function load(): Promise<void> {
  if (!teamId.value) {
    stats.value = null;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<TeamStatsResponse>('/stats/team', {
      params: {
        teamId: teamId.value,
        from: from.value || undefined,
        to: to.value || undefined,
      },
    });
    stats.value = data;
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить статистику');
    stats.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await teams.fetchTeams();
    teamId.value = app.selectedTeamId ?? teams.teams[0]?._id ?? '';
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
  }
  await load();
});

watch(teamId, (id) => {
  app.selectedTeamId = id || null;
  void load();
});

watch([from, to], () => {
  void load();
});
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Статистика команды"
      subtitle="Сводка по журналу выступлений: сколько раз выступили и пропустили, последняя дата по каждому участнику."
    />

    <div class="card">
      <div class="toolbar">
        <div class="field field--sm">
          <label for="st-from">С</label>
          <AppDatePicker id="st-from" v-model="from" />
        </div>
        <div class="field field--sm">
          <label for="st-to">По</label>
          <AppDatePicker id="st-to" v-model="to" />
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <button type="button" class="btn" :disabled="loading || !teamId" @click="load">Обновить</button>
        </div>
      </div>
      <p v-if="teamId" class="stats-context">Контекст: {{ selectedTeamName }}</p>
    </div>

    <AppState
      v-if="!teamId"
      title="Нет доступных команд"
      description="Добавьте команду, чтобы построить статистику."
      tone="empty"
    />

    <AppState
      v-else-if="loading && !stats"
      title="Загружаем статистику"
      description="Считаем записи по фильтрам."
      compact
    />

    <AppState v-else-if="error" title="Ошибка" :description="error" tone="error">
      <template #actions>
        <button type="button" class="btn btn--primary" @click="load">Повторить</button>
      </template>
    </AppState>

    <template v-else-if="stats">
      <div class="card">
        <div class="metrics">
          <div class="metric-card">
            <p class="metric-card__label">Выступили</p>
            <p class="metric-card__value">{{ stats.totals.presented }}</p>
          </div>
          <div class="metric-card">
            <p class="metric-card__label">Пропуски</p>
            <p class="metric-card__value">{{ stats.totals.skipped }}</p>
          </div>
          <div class="metric-card">
            <p class="metric-card__label">Записей в выборке</p>
            <p class="metric-card__value">{{ stats.totals.records }}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">По участникам</h2>
        <AppState
          v-if="stats.users.length === 0"
          title="Нет данных"
          description="За выбранный период нет записей с привязкой к участнику."
          tone="empty"
          compact
        />
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Выступил</th>
                <th>Пропуск</th>
                <th>Последняя дата</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in stats.users" :key="u.userId">
                <td>{{ u.fullName }}</td>
                <td>{{ u.presented }}</td>
                <td>{{ u.skipped }}</td>
                <td>{{ u.lastMoscowDate ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.stats-context {
  margin: var(--space-2) 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--space-3);
}

.metric-card {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.metric-card__label {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.metric-card__value {
  margin: 0.35rem 0 0;
  font-size: 1.5rem;
  font-weight: 800;
}

.card-title {
  margin: 0 0 var(--space-3);
  font-size: 1.05rem;
}
</style>
