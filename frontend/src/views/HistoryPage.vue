<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '@/api/client';
import type { HistoryRow, Team, User } from '@/types/api';
import { useTeamsStore } from '@/stores/teams';

const teams = useTeamsStore();

const filterTeamId = ref('');
const from = ref('');
const to = ref('');
const status = ref<'presented' | 'skipped' | 'no_available' | ''>('');
const rows = ref<HistoryRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

function teamName(row: HistoryRow): string {
  const t = row.teamId;
  if (t && typeof t === 'object' && 'name' in t) {
    return (t as Team).name;
  }
  return String(t);
}

function userName(row: HistoryRow): string {
  const u = row.userId;
  if (u && typeof u === 'object' && 'fullName' in u) {
    return (u as User).fullName;
  }
  if (u === null || u === undefined) {
    return '—';
  }
  return String(u);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<HistoryRow[]>('/history', {
      params: {
        teamId: filterTeamId.value || undefined,
        from: from.value || undefined,
        to: to.value || undefined,
        status: status.value || undefined,
      },
    });
    rows.value = data;
  } catch {
    error.value = 'Не удалось загрузить историю';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await teams.fetchTeams();
  await load();
});

watch([filterTeamId, from, to, status], () => {
  void load();
});
</script>

<template>
  <h1>История</h1>

  <div class="card row">
    <label class="muted" for="ft">Команда</label>
    <select id="ft" v-model="filterTeamId" class="select">
      <option value="">Все</option>
      <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
    </select>

    <label class="muted" for="fr">С</label>
    <input id="fr" v-model="from" class="input" type="date" />

    <label class="muted" for="to">По</label>
    <input id="to" v-model="to" class="input" type="date" />

    <label class="muted" for="st">Статус</label>
    <select id="st" v-model="status" class="select">
      <option value="">Все</option>
      <option value="presented">Выступил</option>
      <option value="skipped">Пропуск</option>
      <option value="no_available">Нет доступных</option>
    </select>
  </div>

  <div class="card">
    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Команда</th>
          <th>Участник</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r._id">
          <td>{{ r.date.slice(0, 10) }}</td>
          <td>{{ teamName(r) }}</td>
          <td>{{ userName(r) }}</td>
          <td>{{ r.status }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
h1 {
  margin-top: 0;
}
</style>
