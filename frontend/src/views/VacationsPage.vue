<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppContextMenu from '@/components/UI/AppContextMenu.vue';
import AppButton from '@/components/UI/AppButton.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import VacationPeriodModal from '@/components/VacationPeriodModal.vue';
import { useAppStore } from '@/stores/app';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyInfo } from '@/composables/useAppNotifications';

const route = useRoute();
const app = useAppStore();
const users = useUsersStore();
const vacations = useVacationsStore();

const filterTeamId = ref('');
const filterUserId = ref('');
const error = ref<string | null>(null);
const confirmOpen = ref(false);
const confirmLoading = ref(false);
const pendingRemovalId = ref<string | null>(null);

const vacationModalOpen = ref(false);
const modalMode = ref<'create' | 'edit'>('create');
const modalVacationId = ref<string | null>(null);
const modalInitialStart = ref('');
const modalInitialEnd = ref('');
const modalSaving = ref(false);
const modalSaveError = ref('');

const selectedUserName = computed(
  () =>
    users.users.find((user) => user._id === filterUserId.value)?.fullName ?? '',
);

async function loadVacations(): Promise<void> {
  if (!filterUserId.value) {
    vacations.vacations = [];
    return;
  }
  error.value = null;
  try {
    await vacations.fetchVacations({ userId: filterUserId.value });
  } catch (e) {
    error.value =
      vacations.error ?? getApiErrorMessage(e, 'Не удалось загрузить отпуска');
  }
}

onMounted(() => {
  filterTeamId.value = app.selectedTeamId ?? '';
});

watch(filterTeamId, async (id) => {
  if (id) {
    try {
      await users.fetchUsers(id, true);
      const q = route.query.userId;
      const fromQuery =
        typeof q === 'string' && users.users.some((u) => u._id === q);
      filterUserId.value = fromQuery ? String(q) : (users.users[0]?._id ?? '');
      await loadVacations();
    } catch (e) {
      error.value =
        users.error ?? getApiErrorMessage(e, 'Не удалось загрузить участников');
    }
  }
});

watch(
  () => app.selectedTeamId,
  (id) => {
    filterTeamId.value = id ?? '';
  },
);

watch(filterUserId, () => {
  if (vacationModalOpen.value) {
    vacationModalOpen.value = false;
  }
  void loadVacations();
});

watch(vacationModalOpen, (open) => {
  if (!open) {
    modalSaveError.value = '';
  }
});

function openCreateModal(): void {
  if (!filterUserId.value) {
    notifyInfo('Выберите участника перед добавлением отпуска');
    return;
  }
  modalMode.value = 'create';
  modalVacationId.value = null;
  modalInitialStart.value = '';
  modalInitialEnd.value = '';
  modalSaveError.value = '';
  vacationModalOpen.value = true;
}

function openEditModal(v: {
  _id: string;
  startDate: string;
  endDate: string;
}): void {
  modalMode.value = 'edit';
  modalVacationId.value = v._id;
  modalInitialStart.value = v.startDate.slice(0, 10);
  modalInitialEnd.value = v.endDate.slice(0, 10);
  modalSaveError.value = '';
  vacationModalOpen.value = true;
}

async function onVacationModalSave(payload: {
  startDate: string;
  endDate: string;
  vacationId?: string;
}): Promise<void> {
  modalSaveError.value = '';
  if (!filterUserId.value) {
    modalSaveError.value = 'Выберите участника';
    notifyInfo('Выберите участника перед сохранением отпуска');
    return;
  }
  modalSaving.value = true;
  try {
    if (payload.vacationId) {
      await vacations.updateVacation(payload.vacationId, {
        startDate: payload.startDate,
        endDate: payload.endDate,
      });
    } else {
      await vacations.createVacation({
        userId: filterUserId.value,
        startDate: payload.startDate,
        endDate: payload.endDate,
      });
    }
    vacationModalOpen.value = false;
    await loadVacations();
  } catch (e) {
    modalSaveError.value = getApiErrorMessage(e, 'Не удалось сохранить отпуск');
  } finally {
    modalSaving.value = false;
  }
}

function openRemoveModal(id: string): void {
  pendingRemovalId.value = id;
  confirmOpen.value = true;
}

async function remove(): Promise<void> {
  if (!pendingRemovalId.value) return;
  error.value = null;
  confirmLoading.value = true;
  try {
    await vacations.deleteVacation(pendingRemovalId.value);
    await loadVacations();
    confirmOpen.value = false;
    pendingRemovalId.value = null;
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось удалить отпуск');
  } finally {
    confirmLoading.value = false;
  }
}

function onVacationContextSelect(
  vacationId: string,
  actionId: string,
): void {
  const row = vacations.vacations.find((x) => x._id === vacationId);
  if (!row) return;
  if (actionId === 'edit') openEditModal(row);
  else if (actionId === 'remove') openRemoveModal(row._id);
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Отпуска"
      subtitle="Планируй периоды отсутствия участников и сразу проверяй историю сохранённых дат."
    />

    <div class="card">
      <div class="toolbar">
        <div class="field field--grow">
          <label for="fu">Участник</label>
          <select id="fu" v-model="filterUserId" class="select">
            <option value="" disabled>Выберите участника</option>
            <!-- eslint-disable-next-line vue/valid-v-for -- ключ u._id; правило не видит u в MemberExpression -->
            <option v-for="u in users.users" :key="u._id" :value="u._id">
              {{ u.fullName }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <AppState
      v-if="!filterTeamId"
      title="Выбери команду в шапке"
      description="После выбора команды сверху станут доступны участники и периоды отпусков."
      tone="empty"
    />

    <template v-else>
      <div class="card">
        <div class="card-heading card-heading--row">
          <div>
            <h2 class="card-heading__title">Периоды</h2>
            <p class="card-heading__subtitle">
              Все сохранённые периоды по выбранному участнику.
            </p>
          </div>
          <AppButton
            variant="primary"
            :disabled="!filterUserId"
            @click="openCreateModal"
          >
            Добавить отпуск
          </AppButton>
        </div>

        <AppState
          v-if="vacations.loading"
          title="Загружаем отпуска"
          description="Подтягиваем сохранённые периоды отсутствия."
          compact
        />
        <AppState
          v-else-if="vacations.vacations.length === 0"
          title="Периодов пока нет"
          description="Создай первый диапазон через кнопку «Добавить отпуск»."
          tone="empty"
        />
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>С</th>
                <th>По</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <!-- eslint-disable-next-line vue/valid-v-for -- :key vacation._id; правило не учитывает vacation в MemberExpression -->
              <tr v-for="vacation in vacations.vacations" :key="vacation._id">
                <td>{{ vacation.startDate.slice(0, 10) }}</td>
                <td>{{ vacation.endDate.slice(0, 10) }}</td>
                <td>
                  <AppContextMenu
                    :trigger-label="`Действия: ${vacation.startDate.slice(0, 10)} — ${vacation.endDate.slice(0, 10)}`"
                    :items="[
                      { id: 'edit', label: 'Изменить' },
                      { id: 'remove', label: 'Удалить', danger: true },
                    ]"
                    @select="(actionId) => onVacationContextSelect(vacation._id, String(actionId))"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="error" class="error page-error">{{ error }}</p>
      </div>
    </template>

    <VacationPeriodModal
      v-model="vacationModalOpen"
      :mode="modalMode"
      :vacation-id="modalVacationId ?? undefined"
      :participant-label="selectedUserName"
      :initial-start="modalInitialStart"
      :initial-end="modalInitialEnd"
      :saving="modalSaving"
      :save-error="modalSaveError"
      @save="onVacationModalSave"
    />

    <AppConfirmModal
      v-model="confirmOpen"
      title="Удалить отпуск?"
      description="Период будет удалён из календаря участника без возможности быстрого восстановления."
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

.card-heading--row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.page-error {
  margin-top: var(--space-3);
}
</style>
