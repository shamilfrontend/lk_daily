<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';

const route = useRoute();
const teams = useTeamsStore();
const users = useUsersStore();
const vacations = useVacationsStore();

const filterTeamId = ref('');
const filterUserId = ref('');
const startDate = ref('');
const endDate = ref('');
const editingId = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  await teams.fetchTeams();
  if (teams.teams[0]) {
    filterTeamId.value = teams.teams[0]._id;
  }
});

watch(filterTeamId, async (id) => {
  if (id) {
    await users.fetchUsers(id, true);
    const q = route.query.userId;
    const fromQuery = typeof q === 'string' && users.users.some((u) => u._id === q);
    filterUserId.value = fromQuery ? String(q) : (users.users[0]?._id ?? '');
    await loadVacations();
  }
});

watch(filterUserId, () => {
  void loadVacations();
});

async function loadVacations(): Promise<void> {
  if (!filterUserId.value) {
    vacations.vacations = [];
    return;
  }
  await vacations.fetchVacations({ userId: filterUserId.value });
}

function startEdit(v: { _id: string; startDate: string; endDate: string }): void {
  editingId.value = v._id;
  startDate.value = v.startDate.slice(0, 10);
  endDate.value = v.endDate.slice(0, 10);
}

function resetForm(): void {
  editingId.value = null;
  startDate.value = '';
  endDate.value = '';
}

async function save(): Promise<void> {
  error.value = null;
  if (!filterUserId.value) {
    error.value = 'Выберите участника';
    return;
  }
  try {
    if (editingId.value) {
      await vacations.updateVacation(editingId.value, {
        startDate: startDate.value,
        endDate: endDate.value,
      });
    } else {
      await vacations.createVacation({
        userId: filterUserId.value,
        startDate: startDate.value,
        endDate: endDate.value,
      });
    }
    resetForm();
    await loadVacations();
  } catch {
    error.value = 'Не удалось сохранить';
  }
}

async function remove(id: string): Promise<void> {
  if (!confirm('Удалить отпуск?')) return;
  error.value = null;
  try {
    await vacations.deleteVacation(id);
    await loadVacations();
  } catch {
    error.value = 'Не удалось удалить';
  }
}
</script>

<template>
  <h1>Отпуска</h1>

  <div class="card">
    <div class="row" style="margin-bottom: 0.75rem">
      <label class="muted" for="ft">Команда</label>
      <select id="ft" v-model="filterTeamId" class="select">
        <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
      </select>

      <label class="muted" for="fu">Участник</label>
      <select id="fu" v-model="filterUserId" class="select">
        <option v-for="u in users.users" :key="u._id" :value="u._id">{{ u.fullName }}</option>
      </select>
    </div>

    <h2>{{ editingId ? 'Редактирование периода' : 'Новый период' }}</h2>
    <form class="grid" @submit.prevent="save">
      <label class="muted">Начало</label>
      <input v-model="startDate" class="input" type="date" required />

      <label class="muted">Конец</label>
      <input v-model="endDate" class="input" type="date" required />

      <div class="row">
        <button class="btn btn--primary" type="submit">Сохранить</button>
        <button v-if="editingId" type="button" class="btn" @click="resetForm">Отмена</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>

  <div class="card">
    <h2>Периоды</h2>
    <p v-if="vacations.loading" class="muted">Загрузка…</p>
    <table v-else class="table">
      <thead>
        <tr>
          <th>С</th>
          <th>По</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in vacations.vacations" :key="v._id">
          <td>{{ v.startDate.slice(0, 10) }}</td>
          <td>{{ v.endDate.slice(0, 10) }}</td>
          <td class="row">
            <button type="button" class="btn" @click="startEdit(v)">Изменить</button>
            <button type="button" class="btn btn--danger" @click="remove(v._id)">Удалить</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
h1 {
  margin-top: 0;
}

h2 {
  margin-top: 0;
  font-size: 1.05rem;
}

.grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.5rem 0.75rem;
  align-items: center;
}

.grid .row {
  grid-column: 1 / -1;
}
</style>
