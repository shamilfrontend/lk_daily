<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useQueueStore } from '@/stores/queue';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';
import { moscowTodayString, weekdayRu } from '@/utils/dates';

const app = useAppStore();
const auth = useAuthStore();
const queue = useQueueStore();
const users = useUsersStore();
const vacations = useVacationsStore();

const actionError = ref<string | null>(null);

const today = moscowTodayString();

const userMap = computed(() => {
  const m = new Map<string, string>();
  for (const u of users.users) {
    m.set(u._id, u.fullName);
  }
  return m;
});

const onVacationToday = computed(() => {
  const set = new Set<string>();
  for (const v of vacations.vacations) {
    const s = v.startDate.slice(0, 10);
    const e = v.endDate.slice(0, 10);
    if (s <= today && e >= today) {
      set.add(v.userId);
    }
  }
  return set;
});

const headline = computed(() => {
  const r = queue.current?.result;
  if (!r) return 'Загрузка…';
  if (r.kind === 'non_working') return 'Сегодня нерабочий день, созвона нет';
  if (r.kind === 'no_queue' || r.kind === 'no_available') return 'Нет доступных докладчиков';
  return r.user.fullName;
});

const canAct = computed(() => {
  if (!auth.isAdmin) return false;
  const r = queue.current?.result;
  return Boolean(r && r.kind === 'ok');
});

async function refresh(): Promise<void> {
  actionError.value = null;
  const tid = app.selectedTeamId;
  if (!tid) return;
  await Promise.all([
    queue.loadAll(tid, 7),
    users.fetchUsers(tid, false),
    vacations.fetchVacations({ teamId: tid }),
  ]);
}

watch(
  () => app.selectedTeamId,
  () => {
    void refresh();
  },
  { immediate: true },
);

async function onPresent(): Promise<void> {
  const tid = app.selectedTeamId;
  if (!tid) return;
  try {
    await queue.present(tid);
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Ошибка';
    actionError.value = String(msg);
  }
}

async function onSkip(): Promise<void> {
  const tid = app.selectedTeamId;
  if (!tid) return;
  try {
    await queue.skip(tid);
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Ошибка';
    actionError.value = String(msg);
  }
}
</script>

<template>
  <section v-if="!app.selectedTeamId" class="card">
    <p class="muted">Выберите команду в шапке.</p>
  </section>

  <section v-else>
    <div class="card">
      <h1>Сегодня показывает</h1>
      <p class="presenter">{{ headline }}</p>
      <p v-if="actionError" class="error">{{ actionError }}</p>
      <div v-if="auth.isAdmin" class="row" style="margin-top: 0.75rem">
        <button type="button" class="btn btn--primary" :disabled="!canAct || queue.loading" @click="onPresent">
          Выступил
        </button>
        <button type="button" class="btn" :disabled="!canAct || queue.loading" @click="onSkip">Пропустить</button>
      </div>
      <p v-if="!auth.isAdmin" class="muted" style="margin-top: 0.5rem">
        Только администратор может отмечать выступление.
      </p>
    </div>

    <div class="card">
      <h2>Текущая очередь</h2>
      <p v-if="queue.loading" class="muted">Загрузка…</p>
      <ol v-else class="queue">
        <li v-for="(id, idx) in queue.order" :key="id" class="queue__item">
          <span class="muted">{{ idx + 1 }}.</span>
          {{ userMap.get(id) ?? id }}
          <span v-if="onVacationToday.has(id)" class="badge" style="margin-left: 0.35rem">в отпуске</span>
        </li>
      </ol>
    </div>

    <div class="card">
      <h2>Ближайшие рабочие дни (прогноз)</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>День недели</th>
            <th>Докладчик</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in queue.upcoming" :key="row.moscowDate">
            <td>{{ row.moscowDate }}</td>
            <td>{{ weekdayRu(row.moscowDate) }}</td>
            <td>{{ row.presenter?.fullName ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped lang="scss">
h1,
h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.presenter {
  font-size: 1.35rem;
  font-weight: 650;
  margin: 0;
}

.queue {
  margin: 0;
  padding-left: 1.1rem;
}

.queue__item {
  margin: 0.25rem 0;
}
</style>
