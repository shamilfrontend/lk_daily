<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppContextMenu from '@/components/UI/AppContextMenu.vue';
import AppButton from '@/components/UI/AppButton.vue';
import AppDatePicker from '@/components/UI/AppDatePicker.vue';
import AppModal from '@/components/UI/AppModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useAppStore } from '@/stores/app';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyInfo } from '@/composables/useAppNotifications';
import { formatCalendarDateRu, moscowTodayString } from '@/utils/dates';

import type { User } from '@/types/api';

const app = useAppStore();
const teams = useTeamsStore();
const users = useUsersStore();
const router = useRouter();

const pageError = ref<string | null>(null);
const confirmOpen = ref(false);
const confirmLoading = ref(false);
const pendingRemoval = ref<User | null>(null);

const participantModalOpen = ref(false);
/** null — создание, иначе id редактируемого участника */
const editingUserId = ref<string | null>(null);
const modalFullName = ref('');
const modalTeamId = ref('');
const modalIsActive = ref(true);
const modalOnMaternityLeave = ref(false);
const modalBirthday = ref('');
const modalError = ref<string | null>(null);
const today = moscowTodayString();

const filterTeamId = computed<string>(() => app.selectedTeamId ?? '');

const modalTitle = computed(() =>
  editingUserId.value ? 'Редактирование участника' : 'Новый участник',
);

onMounted(async () => {
  try {
    await teams.fetchTeams();
  } catch (e) {
    pageError.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
  }
});

watch(
  () => app.selectedTeamId,
  (id) => {
    if (!id) return;
    pageError.value = null;
    void users.fetchUsers(id, true).catch((e) => {
      pageError.value =
        users.error ?? getApiErrorMessage(e, 'Не удалось загрузить участников');
    });
  },
  { immediate: true },
);

watch(participantModalOpen, (open) => {
  if (!open) return;
  modalError.value = null;
  if (editingUserId.value === null) {
    modalTeamId.value = filterTeamId.value;
    modalFullName.value = '';
    modalIsActive.value = true;
    modalOnMaternityLeave.value = false;
    modalBirthday.value = '';
  }
});

async function refreshList(): Promise<void> {
  if (filterTeamId.value) {
    await users.fetchUsers(filterTeamId.value, true);
  }
}

function openCreateModal(): void {
  editingUserId.value = null;
  participantModalOpen.value = true;
}

function openEditModal(u: User): void {
  editingUserId.value = u._id;
  modalFullName.value = u.fullName;
  modalTeamId.value = u.teamId;
  modalIsActive.value = u.isActive;
  modalOnMaternityLeave.value = u.onMaternityLeave === true;
  modalBirthday.value = normalizeBirthdayInput(u.birthday);
  participantModalOpen.value = true;
}

function closeParticipantModal(): void {
  participantModalOpen.value = false;
  editingUserId.value = null;
}

/** Крестик, фон, Escape — v-model меняется из AppModal, нужно сбросить режим редактирования */
function onParticipantModalClose(): void {
  modalError.value = null;
  editingUserId.value = null;
}

async function saveModal(): Promise<void> {
  modalError.value = null;
  if (!modalTeamId.value) {
    modalError.value = 'Выберите команду';
    notifyInfo('Выберите команду перед сохранением участника');
    return;
  }
  try {
    if (editingUserId.value) {
      await users.updateUser(editingUserId.value, {
        fullName: modalFullName.value.trim(),
        teamId: modalTeamId.value,
        isActive: modalIsActive.value,
        onMaternityLeave: modalOnMaternityLeave.value,
        birthday: modalBirthday.value || null,
      });
    } else {
      await users.createUser({
        fullName: modalFullName.value.trim(),
        teamId: modalTeamId.value,
        isActive: modalIsActive.value,
        onMaternityLeave: modalOnMaternityLeave.value,
        birthday: modalBirthday.value || null,
      });
    }
    closeParticipantModal();
    await refreshList();
  } catch (e) {
    modalError.value = getApiErrorMessage(e, 'Не удалось сохранить участника');
  }
}

function openRemoveModal(user: User): void {
  pendingRemoval.value = user;
  confirmOpen.value = true;
}

async function remove(): Promise<void> {
  if (!pendingRemoval.value) return;
  pageError.value = null;
  confirmLoading.value = true;
  try {
    await users.deleteUser(pendingRemoval.value._id);
    await refreshList();
    confirmOpen.value = false;
    pendingRemoval.value = null;
  } catch (e) {
    pageError.value = getApiErrorMessage(
      e,
      'Не удалось деактивировать участника',
    );
  } finally {
    confirmLoading.value = false;
  }
}

function goVacations(userId: string): void {
  void router.push({ name: 'admin-vacations', query: { userId } });
}

function onUserRowMenuSelect(id: string, u: User): void {
  if (id === 'edit') openEditModal(u);
  else if (id === 'vacations') goVacations(u._id);
  else if (id === 'deactivate') openRemoveModal(u);
}

function normalizeBirthdayInput(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatBirthdayForTable(value?: string): string {
  if (!value) return '—';
  return formatCalendarDateRu(value);
}

function isBirthdayToday(value?: string): boolean {
  if (!value) return false;
  const birthdayDate = new Date(value);
  if (Number.isNaN(birthdayDate.getTime())) return false;
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  return (
    birthdayDate.getUTCMonth() + 1 === todayMonth &&
    birthdayDate.getUTCDate() === todayDay &&
    todayYear > 0
  );
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Участники"
      subtitle="Управляй составом команды, активностью и статусом декрета из одного экрана."
    >
      <template #actions>
        <AppButton type="button" variant="primary" @click="openCreateModal">
          Добавить участника
        </AppButton>
      </template>
    </AppPageHeader>

    <div class="card">
      <div class="users-list-head">
        <div>
          <h2 class="users-list-head__title">Список участников</h2>
          <p class="users-list-head__subtitle">
            Редактируй профиль участника, отпуска и активность без переходов
            между формами.
          </p>
        </div>
      </div>

      <p v-if="pageError" class="error">{{ pageError }}</p>

      <AppState
        v-if="users.loading"
        title="Загружаем участников"
        description="Собираем список по выбранной команде."
        compact
      />
      <AppState
        v-else-if="users.users.length === 0"
        title="В этой команде пока нет участников"
        description="Добавь первого участника, чтобы сформировать очередь и отпуска."
        tone="empty"
      />
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Активен</th>
              <th>В декрете</th>
              <th>День рождения</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users.users" :key="u._id">
              <td>{{ u.fullName }}</td>
              <td>{{ u.isActive ? 'Да' : 'Нет' }}</td>
              <td>{{ u.onMaternityLeave ? 'Да' : 'Нет' }}</td>
              <td :class="{ 'birthday-today': isBirthdayToday(u.birthday) }">
                <span>{{ formatBirthdayForTable(u.birthday) }}</span>
                <span
                  v-if="isBirthdayToday(u.birthday)"
                  class="birthday-today__hint"
                  >сегодня</span
                >
              </td>
              <td>
                <AppContextMenu
                  :trigger-label="`Действия: ${u.fullName}`"
                  :items="[
                    { id: 'edit', label: 'Изменить' },
                    { id: 'vacations', label: 'Отпуска' },
                    {
                      id: 'deactivate',
                      label: 'Деактивировать',
                      danger: true,
                      disabled: !u.isActive,
                    },
                  ]"
                  @select="(id) => onUserRowMenuSelect(id, u)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal
      v-model="participantModalOpen"
      :title="modalTitle"
      size="md"
      @close="onParticipantModalClose"
    >
      <form
        class="field-grid participant-modal-form"
        @submit.prevent="saveModal"
      >
        <label class="field__label" for="uc-team">Команда</label>
        <select id="uc-team" v-model="modalTeamId" class="select" required>
          <option v-for="t in teams.teams" :key="t._id" :value="t._id">
            {{ t.name }}
          </option>
        </select>

        <label class="field__label" for="uc-name">ФИО*</label>
        <input id="uc-name" v-model="modalFullName" class="input" required />

        <label class="field__label" for="uc-active">Активен</label>
        <div class="field-grid__check">
          <input
            id="uc-active"
            v-model="modalIsActive"
            type="checkbox"
            class="checkbox"
          />
        </div>

        <label class="field__label" for="uc-mat">В декрете</label>
        <div class="field-grid__check">
          <input
            id="uc-mat"
            v-model="modalOnMaternityLeave"
            type="checkbox"
            class="checkbox"
          />
        </div>

        <label class="field__label" for="uc-birthday">День рождения</label>
        <AppDatePicker id="uc-birthday" v-model="modalBirthday" />

        <p v-if="modalError" class="error field-grid__full">{{ modalError }}</p>

        <div class="actions-row field-grid__full">
          <AppButton variant="primary" type="submit">Сохранить</AppButton>
          <AppButton type="button" @click="closeParticipantModal">
            Отмена
          </AppButton>
        </div>
      </form>
    </AppModal>

    <AppConfirmModal
      v-model="confirmOpen"
      title="Деактивировать участника?"
      :description="
        pendingRemoval
          ? `Участник ${pendingRemoval.fullName} перестанет участвовать в очереди, но его запись сохранится в системе.`
          : ''
      "
      confirm-label="Деактивировать"
      tone="danger"
      :loading="confirmLoading"
      @confirm="remove"
    />
  </section>
</template>

<style scoped lang="scss">
.users-list-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.users-list-head__title,
.users-list-head__subtitle {
  margin: 0;
}

.users-list-head__subtitle {
  margin-top: 0.35rem;
  color: var(--muted);
}

.birthday-today {
  color: #d20f39;
  font-weight: 700;
}

.birthday-today__hint {
  margin-left: 0.4rem;
  font-size: 0.8rem;
  text-transform: uppercase;
}
</style>
