<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useAppStore } from '@/stores/app';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';
import { getApiErrorMessage } from '@/utils/apiError';

const route = useRoute();
const app = useAppStore();
const teams = useTeamsStore();
const users = useUsersStore();
const vacations = useVacationsStore();

const filterTeamId = ref('');
const filterUserId = ref('');
const startDate = ref('');
const endDate = ref('');
const editingId = ref<string | null>(null);
const error = ref<string | null>(null);
const selectedRange = ref<[Date, Date] | null>(null);
const confirmOpen = ref(false);
const confirmLoading = ref(false);
const pendingRemovalId = ref<string | null>(null);

const selectedUserName = computed(() => users.users.find((user) => user._id === filterUserId.value)?.fullName ?? '');

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

onMounted(async () => {
  try {
    await teams.fetchTeams();
    filterTeamId.value = app.selectedTeamId ?? teams.teams[0]?._id ?? '';
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
  }
});

watch(filterTeamId, async (id) => {
  if (id) {
    app.selectedTeamId = id;
    try {
      await users.fetchUsers(id, true);
      const q = route.query.userId;
      const fromQuery = typeof q === 'string' && users.users.some((u) => u._id === q);
      filterUserId.value = fromQuery ? String(q) : (users.users[0]?._id ?? '');
      await loadVacations();
    } catch (e) {
      error.value = users.error ?? getApiErrorMessage(e, 'Не удалось загрузить участников');
    }
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
  error.value = null;
  try {
    await vacations.fetchVacations({ userId: filterUserId.value });
  } catch (e) {
    error.value = vacations.error ?? getApiErrorMessage(e, 'Не удалось загрузить отпуска');
  }
}

function startEdit(v: { _id: string; startDate: string; endDate: string }): void {
  editingId.value = v._id;
  startDate.value = v.startDate.slice(0, 10);
  endDate.value = v.endDate.slice(0, 10);
  selectedRange.value = [parseLocalDate(startDate.value), parseLocalDate(endDate.value)];
}

function resetForm(): void {
  editingId.value = null;
  startDate.value = '';
  endDate.value = '';
  selectedRange.value = null;
}

function onRangeChange(v: [Date, Date] | null): void {
  selectedRange.value = v;
  if (!v || !v[0] || !v[1]) {
    startDate.value = '';
    endDate.value = '';
    return;
  }
  startDate.value = toYmd(v[0]);
  endDate.value = toYmd(v[1]);
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
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось сохранить отпуск');
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
          <label for="ft">Команда</label>
          <select id="ft" v-model="filterTeamId" class="select">
            <option value="" disabled>Выберите команду</option>
            <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
          </select>
        </div>

        <div class="field field--grow">
          <label for="fu">Участник</label>
          <select id="fu" v-model="filterUserId" class="select">
            <option value="" disabled>Выберите участника</option>
            <option v-for="u in users.users" :key="u._id" :value="u._id">{{ u.fullName }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">{{ editingId ? 'Редактирование периода' : 'Новый период' }}</h2>
          <p class="card-heading__subtitle">
            {{ selectedUserName || 'Сначала выбери участника' }}. Диапазон сохраняется по локальной дате без сдвига timezone.
          </p>
        </div>
      </div>

      <form class="field-grid" @submit.prevent="save">
        <label class="field__label">Период</label>
        <VueDatePicker
          :model-value="selectedRange"
          range
          auto-apply
          locale="ru"
          format="yyyy-MM-dd"
          :enable-time-picker="false"
          :clearable="true"
          @update:model-value="onRangeChange"
        />

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
          <h2 class="card-heading__title">Периоды</h2>
          <p class="card-heading__subtitle">Все сохранённые периоды по выбранному участнику.</p>
        </div>
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
        description="Создай первый диапазон, чтобы он появился в списке."
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
            <tr v-for="v in vacations.vacations" :key="v._id">
              <td>{{ v.startDate.slice(0, 10) }}</td>
              <td>{{ v.endDate.slice(0, 10) }}</td>
              <td>
                <div class="actions-row">
                  <button type="button" class="btn" @click="startEdit(v)">Изменить</button>
                  <button type="button" class="btn btn--danger" @click="openRemoveModal(v._id)">Удалить</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

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
</style>
