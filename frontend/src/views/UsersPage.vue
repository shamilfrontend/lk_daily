<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppModal from '@/components/UI/AppModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useAppStore } from '@/stores/app';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import type { User } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';

const app = useAppStore();
const teams = useTeamsStore();
const users = useUsersStore();
const router = useRouter();

const filterTeamId = ref<string>('');
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
const modalError = ref<string | null>(null);

const modalTitle = computed(() =>
  editingUserId.value ? 'Редактирование участника' : 'Новый участник',
);

onMounted(async () => {
  try {
    await teams.fetchTeams();
    filterTeamId.value = app.selectedTeamId ?? teams.teams[0]?._id ?? '';
  } catch (e) {
    pageError.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
  }
});

watch(filterTeamId, (id) => {
  app.selectedTeamId = id || null;
  if (!id) return;
  pageError.value = null;
  void users.fetchUsers(id, true).catch((e) => {
    pageError.value = users.error ?? getApiErrorMessage(e, 'Не удалось загрузить участников');
  });
});

watch(participantModalOpen, (open) => {
  if (!open) return;
  modalError.value = null;
  if (editingUserId.value === null) {
    modalTeamId.value = filterTeamId.value;
    modalFullName.value = '';
    modalIsActive.value = true;
    modalOnMaternityLeave.value = false;
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
    return;
  }
  try {
    if (editingUserId.value) {
      await users.updateUser(editingUserId.value, {
        fullName: modalFullName.value.trim(),
        teamId: modalTeamId.value,
        isActive: modalIsActive.value,
        onMaternityLeave: modalOnMaternityLeave.value,
      });
    } else {
      await users.createUser({
        fullName: modalFullName.value.trim(),
        teamId: modalTeamId.value,
        isActive: modalIsActive.value,
        onMaternityLeave: modalOnMaternityLeave.value,
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
    pageError.value = getApiErrorMessage(e, 'Не удалось деактивировать участника');
  } finally {
    confirmLoading.value = false;
  }
}

function goVacations(userId: string): void {
  void router.push({ name: 'admin-vacations', query: { userId } });
}

const importPreview = ref<{ fullName: string }[]>([]);
const importModalOpen = ref(false);
const importError = ref<string | null>(null);
const importBusy = ref(false);

function parseCsvForImport(text: string): { fullName: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const firstCellRaw = (lines[0].includes(';') ? lines[0].split(';') : lines[0].split(','))[0]?.trim() ?? '';
  const maybeHeader = /^fullName$|^фио$/i.test(firstCellRaw);
  const start = maybeHeader ? 1 : 0;
  const rows: { fullName: string }[] = [];
  for (let i = start; i < lines.length; i++) {
    const cellRaw = (lines[i].includes(';') ? lines[i].split(';') : lines[i].split(','))[0]?.trim() ?? '';
    const cell = cellRaw.replace(/^"|"$/g, '').trim();
    if (cell.length > 0) {
      rows.push({ fullName: cell });
    }
  }
  return rows.slice(0, 500);
}

function onCsvChosen(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  importError.value = null;
  importPreview.value = [];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    importPreview.value = parseCsvForImport(text);
    if (importPreview.value.length === 0) {
      importError.value = 'Нет строк для импорта (первая колонка — ФИО, разделитель , или ;).';
    } else {
      importModalOpen.value = true;
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

async function confirmCsvImport(): Promise<void> {
  if (!filterTeamId.value || importPreview.value.length === 0) {
    return;
  }
  importBusy.value = true;
  importError.value = null;
  try {
    await users.importUsers(filterTeamId.value, importPreview.value);
    importModalOpen.value = false;
    importPreview.value = [];
    await refreshList();
  } catch (e) {
    importError.value = getApiErrorMessage(e, 'Импорт не выполнен');
  } finally {
    importBusy.value = false;
  }
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Участники"
      subtitle="Управляй составом команды, активностью и статусом декрета из одного экрана."
    >
      <template #actions>
        <button type="button" class="btn btn--primary" @click="openCreateModal">Добавить участника</button>
      </template>
    </AppPageHeader>

    <div class="card">
      <div class="toolbar">
        <div class="field field--grow">
          <label for="ft">Команда</label>
          <select id="ft" v-model="filterTeamId" class="select">
            <option value="" disabled>Выберите команду</option>
            <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="users-list-head">
        <div>
          <h2 class="users-list-head__title">Импорт из CSV</h2>
          <p class="users-list-head__subtitle">
            Первая колонка — ФИО; первая строка может быть заголовком «fullName» или «ФИО». До 500 строк за раз.
          </p>
        </div>
      </div>
      <div class="toolbar">
        <div class="field field--grow">
          <label for="csv">Файл</label>
          <input
            id="csv"
            class="input"
            type="file"
            accept=".csv,text/csv"
            :disabled="!filterTeamId"
            @change="onCsvChosen"
          />
        </div>
      </div>
      <p v-if="importError && !importModalOpen" class="error">{{ importError }}</p>
    </div>

    <div class="card">
      <div class="users-list-head">
        <div>
          <h2 class="users-list-head__title">Список участников</h2>
          <p class="users-list-head__subtitle">Редактируй профиль участника, отпуска и активность без переходов между формами.</p>
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
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users.users" :key="u._id">
              <td>{{ u.fullName }}</td>
              <td>{{ u.isActive ? 'Да' : 'Нет' }}</td>
              <td>{{ u.onMaternityLeave ? 'Да' : 'Нет' }}</td>
              <td>
                <div class="actions-row">
                  <button type="button" class="btn" @click="openEditModal(u)">Изменить</button>
                  <button type="button" class="btn" @click="goVacations(u._id)">Отпуска</button>
                  <button type="button" class="btn btn--danger" :disabled="!u.isActive" @click="openRemoveModal(u)">
                    Деактивировать
                  </button>
                </div>
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
    <form class="field-grid participant-modal-form" @submit.prevent="saveModal">
      <label class="field__label" for="uc-team">Команда</label>
      <select id="uc-team" v-model="modalTeamId" class="select" required>
        <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
      </select>

      <label class="field__label" for="uc-name">ФИО*</label>
      <input id="uc-name" v-model="modalFullName" class="input" required />

      <label class="field__label" for="uc-active">Активен</label>
      <div class="field-grid__check">
        <input id="uc-active" v-model="modalIsActive" type="checkbox" class="checkbox" />
      </div>

      <label class="field__label" for="uc-mat">В декрете</label>
      <div class="field-grid__check">
        <input id="uc-mat" v-model="modalOnMaternityLeave" type="checkbox" class="checkbox" />
      </div>

      <p v-if="modalError" class="error field-grid__full">{{ modalError }}</p>

      <div class="actions-row field-grid__full">
        <button class="btn btn--primary" type="submit">Сохранить</button>
        <button type="button" class="btn" @click="closeParticipantModal">Отмена</button>
      </div>
    </form>
  </AppModal>

  <AppModal v-model="importModalOpen" title="Предпросмотр импорта" size="lg" @close="importError = null">
    <p class="import-hint">Будет создано записей: {{ importPreview.length }}. Команда: текущий фильтр.</p>
    <p v-if="importError" class="error">{{ importError }}</p>
    <div class="table-wrap import-preview-table">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>ФИО</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in importPreview.slice(0, 20)" :key="idx">
            <td>{{ idx + 1 }}</td>
            <td>{{ row.fullName }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="importPreview.length > 20" class="import-more">… и ещё {{ importPreview.length - 20 }}</p>
    </div>
    <div class="actions-row">
      <button type="button" class="btn btn--primary" :disabled="importBusy" @click="confirmCsvImport">
        Импортировать
      </button>
      <button type="button" class="btn" :disabled="importBusy" @click="importModalOpen = false">Отмена</button>
    </div>
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

.import-hint {
  margin: 0 0 var(--space-2);
  color: var(--muted);
}

.import-preview-table {
  max-height: 16rem;
  overflow: auto;
  margin-bottom: var(--space-3);
}

.import-more {
  margin: var(--space-2) 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}
</style>
