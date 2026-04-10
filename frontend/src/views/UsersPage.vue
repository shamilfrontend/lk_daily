<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';

const teams = useTeamsStore();
const users = useUsersStore();
const router = useRouter();

const filterTeamId = ref<string>('');
const fullName = ref('');
const email = ref('');
const isActive = ref(true);
const editingId = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  await teams.fetchTeams();
  if (teams.teams[0]) {
    filterTeamId.value = teams.teams[0]._id;
  }
});

watch(filterTeamId, (id) => {
  if (id) void users.fetchUsers(id, true);
});

async function refreshList(): Promise<void> {
  if (filterTeamId.value) {
    await users.fetchUsers(filterTeamId.value, true);
  }
}

function startEdit(u: {
  _id: string;
  fullName: string;
  email?: string;
  teamId: string;
  isActive: boolean;
}): void {
  editingId.value = u._id;
  fullName.value = u.fullName;
  email.value = u.email ?? '';
  isActive.value = u.isActive;
  filterTeamId.value = u.teamId;
}

function resetForm(): void {
  editingId.value = null;
  fullName.value = '';
  email.value = '';
  isActive.value = true;
}

async function save(): Promise<void> {
  error.value = null;
  if (!filterTeamId.value) {
    error.value = 'Выберите команду';
    return;
  }
  try {
    if (editingId.value) {
      await users.updateUser(editingId.value, {
        fullName: fullName.value.trim(),
        email: email.value.trim() || undefined,
        teamId: filterTeamId.value,
        isActive: isActive.value,
      });
    } else {
      await users.createUser({
        fullName: fullName.value.trim(),
        email: email.value.trim() || undefined,
        teamId: filterTeamId.value,
        isActive: isActive.value,
      });
    }
    resetForm();
    await refreshList();
  } catch {
    error.value = 'Не удалось сохранить';
  }
}

async function remove(u: { _id: string }): Promise<void> {
  if (!confirm('Деактивировать участника?')) return;
  error.value = null;
  try {
    await users.deleteUser(u._id);
    await refreshList();
  } catch {
    error.value = 'Не удалось удалить';
  }
}

function goVacations(userId: string): void {
  void router.push({ name: 'admin-vacations', query: { userId } });
}
</script>

<template>
  <h1>Участники</h1>

  <div class="card">
    <div class="row" style="margin-bottom: 0.75rem">
      <label class="muted" for="ft">Команда</label>
      <select id="ft" v-model="filterTeamId" class="select">
        <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
      </select>
    </div>

    <h2>{{ editingId ? 'Редактирование' : 'Новый участник' }}</h2>
    <form class="grid" @submit.prevent="save">
      <label class="muted">ФИО*</label>
      <input v-model="fullName" class="input" required />

      <label class="muted">Email</label>
      <input v-model="email" class="input" type="email" />

      <label class="muted">Активен</label>
      <input v-model="isActive" type="checkbox" />

      <div class="row">
        <button class="btn btn--primary" type="submit">Сохранить</button>
        <button v-if="editingId" type="button" class="btn" @click="resetForm">Отмена</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>

  <div class="card">
    <h2>Список</h2>
    <p v-if="users.loading" class="muted">Загрузка…</p>
    <table v-else class="table">
      <thead>
        <tr>
          <th>ФИО</th>
          <th>Email</th>
          <th>Активен</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users.users" :key="u._id">
          <td>{{ u.fullName }}</td>
          <td>{{ u.email ?? '—' }}</td>
          <td>{{ u.isActive ? 'да' : 'нет' }}</td>
          <td class="row">
            <button type="button" class="btn" @click="startEdit(u)">Изменить</button>
            <button type="button" class="btn" @click="goVacations(u._id)">Отпуска</button>
            <button type="button" class="btn btn--danger" :disabled="!u.isActive" @click="remove(u)">
              Деактивировать
            </button>
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
