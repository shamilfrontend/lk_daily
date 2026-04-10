<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTeamsStore } from '@/stores/teams';

const teams = useTeamsStore();

const name = ref('');
const description = ref('');
const region = ref('');
const editingId = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(() => {
  void teams.fetchTeams();
});

function startEdit(t: { _id: string; name: string; description?: string; region?: string }): void {
  editingId.value = t._id;
  name.value = t.name;
  description.value = t.description ?? '';
  region.value = t.region ?? '';
}

function resetForm(): void {
  editingId.value = null;
  name.value = '';
  description.value = '';
  region.value = '';
}

async function save(): Promise<void> {
  error.value = null;
  try {
    if (editingId.value) {
      await teams.updateTeam(editingId.value, {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        region: region.value.trim() || undefined,
      });
    } else {
      await teams.createTeam({
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        region: region.value.trim() || undefined,
      });
    }
    resetForm();
  } catch {
    error.value = 'Не удалось сохранить';
  }
}

async function remove(id: string): Promise<void> {
  if (!confirm('Удалить команду? Участники будут деактивированы.')) return;
  error.value = null;
  try {
    await teams.deleteTeam(id);
    if (editingId.value === id) resetForm();
  } catch {
    error.value = 'Не удалось удалить';
  }
}
</script>

<template>
  <h1>Управление командами</h1>

  <div class="card">
    <h2>{{ editingId ? 'Редактирование' : 'Новая команда' }}</h2>
    <form class="grid" @submit.prevent="save">
      <label class="muted">Название*</label>
      <input v-model="name" class="input" required />

      <label class="muted">Описание</label>
      <input v-model="description" class="input" />

      <label class="muted">Регион (код)</label>
      <input v-model="region" class="input" placeholder="RU-MOW" />

      <div class="row">
        <button class="btn btn--primary" type="submit">Сохранить</button>
        <button v-if="editingId" type="button" class="btn" @click="resetForm">Отмена</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>

  <div class="card">
    <h2>Список</h2>
    <p v-if="teams.loading" class="muted">Загрузка…</p>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Регион</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in teams.teams" :key="t._id">
          <td>{{ t.name }}</td>
          <td>{{ t.region ?? '—' }}</td>
          <td class="row">
            <button type="button" class="btn" @click="startEdit(t)">Изменить</button>
            <button type="button" class="btn btn--danger" @click="remove(t._id)">Удалить</button>
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
  grid-template-columns: 140px 1fr;
  gap: 0.5rem 0.75rem;
  align-items: center;
}

.grid .row {
  grid-column: 1 / -1;
}
</style>
