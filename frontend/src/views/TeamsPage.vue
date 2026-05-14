<script setup lang="ts">
import { onMounted, ref } from 'vue';

import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppContextMenu from '@/components/UI/AppContextMenu.vue';
import AppButton from '@/components/UI/AppButton.vue';
import AppModal from '@/components/UI/AppModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useAuthStore } from '@/stores/auth';
import { useTeamsStore } from '@/stores/teams';
import { getApiErrorMessage } from '@/utils/apiError';

import type { Team } from '@/types/api';

const teams = useTeamsStore();
const auth = useAuthStore();
const DEFAULT_TEAM_REGION = 'RU-MOW';

const createModalOpen = ref(false);
const editModalOpen = ref(false);
const createName = ref('');
const createDescription = ref('');
const createError = ref<string | null>(null);
const editingTeamId = ref<string | null>(null);
const editName = ref('');
const editDescription = ref('');
const editError = ref<string | null>(null);
const pageError = ref<string | null>(null);
const confirmOpen = ref(false);
const confirmLoading = ref(false);
const pendingRemoval = ref<Team | null>(null);

onMounted(() => {
  void teams.fetchTeams();
});

const handleAddTeamBtnClick = (): void => {
  createError.value = null;
  createModalOpen.value = true;
};

function resetCreateForm(): void {
  createName.value = '';
  createDescription.value = '';
  createError.value = null;
}

function closeCreateModal(): void {
  createModalOpen.value = false;
  resetCreateForm();
}

function openEditModal(t: Team): void {
  editingTeamId.value = t._id;
  editName.value = t.name;
  editDescription.value = t.description ?? '';
  editError.value = null;
  editModalOpen.value = true;
}

function resetEditForm(): void {
  editingTeamId.value = null;
  editName.value = '';
  editDescription.value = '';
  editError.value = null;
}

function closeEditModal(): void {
  editModalOpen.value = false;
  resetEditForm();
}

async function saveCreate(): Promise<void> {
  createError.value = null;
  try {
    await teams.createTeam({
      name: createName.value.trim(),
      description: createDescription.value.trim() || undefined,
      region: DEFAULT_TEAM_REGION,
    });
    closeCreateModal();
  } catch (e) {
    createError.value = getApiErrorMessage(e, 'Не удалось создать команду');
  }
}

async function saveEdit(): Promise<void> {
  if (!editingTeamId.value) return;
  editError.value = null;
  try {
    await teams.updateTeam(editingTeamId.value, {
      name: editName.value.trim(),
      description: editDescription.value.trim() || undefined,
    });
    closeEditModal();
  } catch (e) {
    editError.value = getApiErrorMessage(e, 'Не удалось сохранить команду');
  }
}

function openRemoveModal(team: Team): void {
  pendingRemoval.value = team;
  confirmOpen.value = true;
}

async function remove(): Promise<void> {
  if (!pendingRemoval.value) return;
  pageError.value = null;
  confirmLoading.value = true;
  try {
    await teams.deleteTeam(pendingRemoval.value._id);
    if (editingTeamId.value === pendingRemoval.value._id) closeEditModal();
    confirmOpen.value = false;
    pendingRemoval.value = null;
  } catch (e) {
    pageError.value = getApiErrorMessage(e, 'Не удалось удалить команду');
  } finally {
    confirmLoading.value = false;
  }
}

function onTeamRowMenuSelect(id: string, t: Team): void {
  if (id === 'edit') openEditModal(t);
  else if (id === 'remove') openRemoveModal(t);
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Управление командами"
      subtitle="Создавай команды, меняй их описание и региональные настройки без отдельного мастера."
    >
      <template #actions>
        <AppButton
          v-if="auth.isSuperAdmin"
          variant="primary"
          @click="handleAddTeamBtnClick"
        >
          Добавить команду
        </AppButton>
      </template>
    </AppPageHeader>

    <AppState
      v-if="!auth.isSuperAdmin"
      title="Раздел для суперадминистратора"
      description="Создание и удаление команд доступно только роли super. Твои команды видны в списке ниже."
      tone="empty"
      compact
    />

    <div class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">Список команд</h2>
          <p class="card-heading__subtitle">
            Удаление деактивирует связанных участников, поэтому подтверждается
            отдельно.
          </p>
        </div>
      </div>
      <p v-if="pageError" class="error">{{ pageError }}</p>

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
                <AppContextMenu
                  v-if="auth.isSuperAdmin"
                  :trigger-label="`Действия: ${t.name}`"
                  :items="[
                    { id: 'edit', label: 'Изменить' },
                    { id: 'remove', label: 'Удалить', danger: true },
                  ]"
                  @select="(id) => onTeamRowMenuSelect(id, t)"
                />
                <span v-else class="teams-readonly">Просмотр</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal
      v-if="auth.isSuperAdmin"
      v-model="createModalOpen"
      title="Новая команда"
      @close="resetCreateForm"
    >
      <form class="team-form" @submit.prevent="saveCreate">
				<div class="team-form__item">
					<label class="field__label" for="team-create-name">Название*</label>
					<input
						id="team-create-name"
						v-model="createName"
						class="input"
						placeholder="Введите название"
						required
					/>
				</div>

				<div class="team-form__item">
					<label class="field__label" for="team-create-description">Описание</label>
					<input
						id="team-create-description"
						v-model="createDescription"
						placeholder="Введите описание"
						class="input"
					/>
				</div>

        <p v-if="createError" class="error field-grid__full">{{ createError }}</p>

        <div class="actions-row field-grid__full">
          <AppButton variant="primary" type="submit">Сохранить</AppButton>
          <AppButton type="button" @click="closeCreateModal">Отмена</AppButton>
        </div>
      </form>
    </AppModal>

    <AppModal
      v-if="auth.isSuperAdmin"
      v-model="editModalOpen"
      title="Редактирование команды"
      @close="resetEditForm"
    >
      <form class="team-form" @submit.prevent="saveEdit">
				<div class="team-form__item">
					<label class="field__label" for="team-edit-name">Название*</label>
					<input
						id="team-edit-name"
						v-model="editName"
						class="input"
						placeholder="Введите название"
						required
					/>
				</div>

				<div class="team-form__item">
					<label class="field__label" for="team-edit-description">Описание</label>
					<input
						id="team-edit-description"
						v-model="editDescription"
						class="input"
						placeholder="Введите описание"
					/>
				</div>

        <p v-if="editError" class="error field-grid__full">{{ editError }}</p>

        <div class="actions-row field-grid__full">
          <AppButton variant="primary" type="submit">Сохранить</AppButton>
          <AppButton type="button" @click="closeEditModal">Отмена</AppButton>
        </div>
      </form>
    </AppModal>

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
.team-form {
	&__item {
		margin-bottom: 24px;
	}
}

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
