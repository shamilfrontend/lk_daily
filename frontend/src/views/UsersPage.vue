<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import UserAvatar from '@/components/UserAvatar.vue';
import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppContextMenu from '@/components/UI/AppContextMenu.vue';
import AppButton from '@/components/UI/AppButton.vue';
import AppDatePicker from '@/components/UI/AppDatePicker.vue';
import AppModal from '@/components/UI/AppModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import AppSwitch from '@/components/UI/AppSwitch.vue';
import { useAppStore } from '@/stores/app';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyInfo } from '@/composables/useAppNotifications';
import { GENDER_OPTIONS, type UserGender } from '@/constants/userGenders';
import {
  JOB_ROLE_OPTIONS,
  jobRoleLabel,
  type UserJobRole,
} from '@/constants/userJobRoles';
import {
  formatCalendarDayMonthRu,
  moscowTodayString,
} from '@/utils/dates';
import { avatarSrc, readImageFileAsDataUrl } from '@/utils/userAvatar';

import type { User } from '@/types/api';

const app = useAppStore();
const teams = useTeamsStore();
const users = useUsersStore();

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
const modalOnSickLeave = ref(false);
const modalJobRole = ref<UserJobRole | ''>('');
const modalGender = ref<UserGender>('male');
const modalAvatar = ref<string | null>(null);
const modalBirthday = ref('');
const modalError = ref<string | null>(null);
const avatarFileInput = ref<HTMLInputElement | null>(null);
const today = moscowTodayString();

const filterTeamId = computed<string>(() => app.selectedTeamId ?? '');

const modalTitle = computed(() =>
  editingUserId.value ? 'Редактирование участника' : 'Новый участник',
);

const modalAvatarPreview = computed(() => avatarSrc(modalAvatar.value));

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
    modalOnSickLeave.value = false;
    modalJobRole.value = '';
    modalGender.value = 'male';
    modalAvatar.value = null;
    modalBirthday.value = '';
  }
});

async function refreshList(): Promise<void> {
  if (filterTeamId.value) {
    await users.fetchUsers(filterTeamId.value, true);
  }
}

function normalizeBirthdayInput(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatBirthdayForTable(value?: string): string {
  if (!value) return '—';
  return formatCalendarDayMonthRu(value);
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
  modalOnSickLeave.value = u.onSickLeave === true;
  modalJobRole.value = u.jobRole ?? '';
  modalGender.value = u.gender ?? 'male';
  modalAvatar.value = u.avatar ?? null;
  modalBirthday.value = normalizeBirthdayInput(u.birthday);
  participantModalOpen.value = true;
}

async function onAvatarFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    modalAvatar.value = await readImageFileAsDataUrl(file);
    modalError.value = null;
  } catch (e) {
    modalError.value =
      e instanceof Error ? e.message : 'Не удалось загрузить изображение';
  } finally {
    input.value = '';
  }
}

function clearModalAvatar(): void {
  modalAvatar.value = null;
  if (avatarFileInput.value) {
    avatarFileInput.value.value = '';
  }
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
  if (!modalGender.value) {
    modalError.value = 'Выберите пол';
    return;
  }
  const payload = {
    fullName: modalFullName.value.trim(),
    teamId: modalTeamId.value,
    gender: modalGender.value,
    avatar: modalAvatar.value,
    isActive: modalIsActive.value,
    onMaternityLeave: modalOnMaternityLeave.value,
    onSickLeave: modalOnSickLeave.value,
    jobRole: modalJobRole.value || null,
    birthday: modalBirthday.value || null,
  };
  try {
    if (editingUserId.value) {
      await users.updateUser(editingUserId.value, payload);
    } else {
      await users.createUser(payload);
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

function onUserRowMenuSelect(id: string, u: User): void {
  if (id === 'edit') openEditModal(u);
  else if (id === 'deactivate') openRemoveModal(u);
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Участники"
      subtitle="Управляй составом команды, активностью, декретом и больничным из одного экрана."
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
              <th class="table__col-avatar" />
              <th>ФИО</th>
              <th>Роль</th>
              <th>Активен</th>
              <th>В декрете</th>
              <th>На больничном</th>
              <th>День рождения</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users.users" :key="u._id">
              <td class="table__col-avatar">
                <UserAvatar :avatar="u.avatar" :name="u.fullName" />
              </td>
              <td>{{ u.fullName }}</td>
              <td>{{ jobRoleLabel(u.jobRole) }}</td>
              <td>{{ u.isActive ? 'Да' : 'Нет' }}</td>
              <td>{{ u.onMaternityLeave ? 'Да' : 'Нет' }}</td>
              <td>{{ u.onSickLeave ? 'Да' : 'Нет' }}</td>
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
      <form class="participant-modal-form" @submit.prevent="saveModal">
        <div class="field">
          <label class="field__label" for="uc-team">Команда</label>
          <select id="uc-team" v-model="modalTeamId" class="select" required>
            <option v-for="t in teams.teams" :key="t._id" :value="t._id">
              {{ t.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="uc-name">ФИО*</label>
          <input id="uc-name" v-model="modalFullName" class="input" placeholder="Введите ФИО" required />
        </div>

        <div class="field">
          <label class="field__label" for="uc-gender">Пол*</label>
          <select id="uc-gender" v-model="modalGender" class="select" required>
            <option
              v-for="opt in GENDER_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="field avatar-field">
          <span class="field__label">Аватар</span>
          <div class="avatar-field__row">
            <UserAvatar
              :avatar="modalAvatar"
              :name="modalFullName || 'Участник'"
              size="md"
            />
            <div class="avatar-field__actions">
              <input
                ref="avatarFileInput"
                type="file"
                accept="image/*"
                class="avatar-field__input"
                @change="onAvatarFileChange"
              />
              <AppButton type="button" @click="avatarFileInput?.click()">
                Загрузить фото
              </AppButton>
              <AppButton
                v-if="modalAvatarPreview"
                type="button"
                @click="clearModalAvatar"
              >
                Удалить фото
              </AppButton>
            </div>
          </div>
        </div>

        <div class="field">
          <AppSwitch
            v-model="modalIsActive"
            aria-labelledby="uc-active-lbl"
					>
						Активен
					</AppSwitch>
        </div>

        <div class="field">
          <AppSwitch
            v-model="modalOnMaternityLeave"
            aria-labelledby="uc-mat-lbl"
          >
            В декрете
          </AppSwitch>
        </div>

        <div class="field">
          <AppSwitch
            v-model="modalOnSickLeave"
            aria-labelledby="uc-sick-lbl"
          >
            На больничном
          </AppSwitch>
        </div>

        <div class="field">
          <label class="field__label" for="uc-job-role">Роль</label>
          <select id="uc-job-role" v-model="modalJobRole" class="select">
            <option value="">Не указана</option>
            <option
              v-for="opt in JOB_ROLE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="uc-birthday">День рождения</label>
          <AppDatePicker id="uc-birthday" v-model="modalBirthday" />
        </div>

        <p v-if="modalError" class="error">{{ modalError }}</p>

        <div class="actions-row">
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

.participant-modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.table__col-avatar {
  width: 2.75rem;
}

.avatar-field__row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.avatar-field__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.avatar-field__input {
  display: none;
}
</style>
