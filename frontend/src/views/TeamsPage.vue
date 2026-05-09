<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { RU_REGIONS } from '@/constants/ruRegions';
import { useAuthStore } from '@/stores/auth';
import { useTeamsStore } from '@/stores/teams';
import type { Team } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';

const teams = useTeamsStore();
const auth = useAuthStore();

const name = ref('');
const description = ref('');
const region = ref('');
const editingId = ref<string | null>(null);
const error = ref<string | null>(null);
const confirmOpen = ref(false);
const confirmLoading = ref(false);
const pendingRemoval = ref<Team | null>(null);
const isCustomRegion = computed(() => Boolean(region.value && !RU_REGIONS.some((r) => r.code === region.value)));

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
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось сохранить команду');
  }
}

function openRemoveModal(team: Team): void {
  pendingRemoval.value = team;
  confirmOpen.value = true;
}

async function remove(): Promise<void> {
  if (!pendingRemoval.value) return;
  error.value = null;
  confirmLoading.value = true;
  try {
    await teams.deleteTeam(pendingRemoval.value._id);
    if (editingId.value === pendingRemoval.value._id) resetForm();
    confirmOpen.value = false;
    pendingRemoval.value = null;
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось удалить команду');
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Управление командами"
      subtitle="Создавай команды, меняй их описание и региональные настройки без отдельного мастера."
    />

    <AppState
      v-if="!auth.isSuperAdmin"
      title="Раздел для суперадминистратора"
      description="Создание и удаление команд доступно только роли super. Твои команды видны в списке ниже."
      tone="empty"
      compact
    />

    <div v-if="auth.isSuperAdmin" class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">{{ editingId ? 'Редактирование команды' : 'Новая команда' }}</h2>
          <p class="card-heading__subtitle">Регион влияет на производственный календарь и региональные нерабочие дни.</p>
        </div>
      </div>

      <form class="field-grid" @submit.prevent="save">
        <label class="field__label">Название*</label>
        <input v-model="name" class="input" required />

        <label class="field__label">Описание</label>
        <input v-model="description" class="input" />

        <label class="field__label">Регион</label>
        <select v-model="region" class="select">
          <option value="">Не задан</option>
          <option v-if="isCustomRegion" :value="region">Кастомный: {{ region }}</option>
          <option v-for="r in RU_REGIONS" :key="r.code" :value="r.code">{{ r.code }} — {{ r.name }}</option>
        </select>

        <div class="actions-row field-grid__full">
          <button class="btn btn--primary" type="submit">Сохранить</button>
          <button v-if="editingId" type="button" class="btn" @click="resetForm">Отмена</button>
        </div>
        <p v-if="error" class="error field-grid__full">{{ error }}</p>
      </form>
    </div>

    <div class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">Список команд</h2>
          <p class="card-heading__subtitle">Удаление деактивирует связанных участников, поэтому подтверждается отдельно.</p>
        </div>
      </div>

      <AppState
        v-if="teams.loading"
        title="Загружаем команды"
        description="Подтягиваем список команд и их регионы."
        compact
      />
      <AppState
        v-else-if="teams.teams.length === 0"
        title="Команд пока нет"
        description="Создай первую команду, чтобы начать работу с очередями и отпусками."
        tone="empty"
      />
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Регион</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in teams.teams" :key="t._id">
              <td>{{ t.name }}</td>
              <td>{{ t.region ?? '—' }}</td>
              <td>
                <div v-if="auth.isSuperAdmin" class="actions-row">
                  <button type="button" class="btn" @click="startEdit(t)">Изменить</button>
                  <button type="button" class="btn btn--danger" @click="openRemoveModal(t)">Удалить</button>
                </div>
                <span v-else class="teams-readonly">Просмотр</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppConfirmModal
      v-if="auth.isSuperAdmin"
      v-model="confirmOpen"
      title="Удалить команду?"
      :description="
        pendingRemoval
          ? `Команда ${pendingRemoval.name} будет удалена, а связанные участники будут деактивированы.`
          : ''
      "
      confirm-label="Удалить"
      tone="danger"
      :loading="confirmLoading"
      @confirm="remove"
    />
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

.teams-readonly {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
