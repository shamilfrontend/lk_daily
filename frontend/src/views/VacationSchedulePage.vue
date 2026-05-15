<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import VacationScheduleConflicts from '@/components/VacationScheduleConflicts.vue';
import VacationScheduleGrid from '@/components/VacationScheduleGrid.vue';
import VacationPeriodModal from '@/components/VacationPeriodModal.vue';
import AppButton from '@/components/UI/AppButton.vue';
import AppConfirmModal from '@/components/UI/AppConfirmModal.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import AppSwitch from '@/components/UI/AppSwitch.vue';
import { useVacationSchedule } from '@/composables/useVacationSchedule';
import { notifyInfo } from '@/composables/useAppNotifications';
import {
  JOB_ROLE_COLORS,
  JOB_ROLE_OPTIONS,
  jobRoleLabel,
} from '@/constants/userJobRoles';
import { useAuthStore } from '@/stores/auth';
import { useUsersStore } from '@/stores/users';
import { useVacationsStore } from '@/stores/vacations';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatCalendarDateRu } from '@/utils/dates';
import { complianceDetailRu } from '@/utils/vacationLaborCompliance';
import { vacationDurationDays } from '@/utils/vacationSchedule';

import type { User } from '@/types/api';
import type { VacationBarSegment } from '@/utils/vacationSchedule';

const auth = useAuthStore();
const usersStore = useUsersStore();
const vacationsStore = useVacationsStore();

const {
  year,
  teamId,
  roleFilter,
  showOnlyConflicts,
  showOnlyLaborIssues,
  complianceByUserId,
  loadError,
  conflictMonths,
  conflictRanges,
  nonWorkingSegments,
  visibleRows,
  isLoading,
  highlightedUserIds,
  selectedBar,
  emptyStateDescription,
  load,
  setYear,
  toggleRoleFilter,
  clearRoleFilter,
  focusConflictParticipants,
  selectBar,
  clearSelectedBar,
} = useVacationSchedule();

const canManageVacations = computed(() => auth.isAdmin && Boolean(teamId.value));

const vacationModalOpen = ref(false);
const modalMode = ref<'create' | 'edit'>('create');
const modalUserId = ref('');
const modalVacationId = ref<string | null>(null);
const modalInitialStart = ref('');
const modalInitialEnd = ref('');
const modalSaving = ref(false);
const modalSaveError = ref('');

const confirmOpen = ref(false);
const confirmLoading = ref(false);
const pendingRemoval = ref<{
  vacationId: string;
  label: string;
} | null>(null);

const modalParticipantLabel = computed(() => {
  const user = usersStore.users.find((u) => u._id === modalUserId.value);
  return user?.fullName ?? '';
});

const selectedBarLaborCompliance = computed(() => {
  if (!selectedBar.value) return null;
  return complianceByUserId.value.get(selectedBar.value.user._id) ?? null;
});

function prevYear(): void {
  setYear(year.value - 1);
}

function nextYear(): void {
  setYear(year.value + 1);
}

function openCreateVacation(): void {
  if (!teamId.value) {
    notifyInfo('Выберите команду в шапке');
    return;
  }
  modalMode.value = 'create';
  modalVacationId.value = null;
  modalUserId.value = usersStore.users[0]?._id ?? '';
  modalInitialStart.value = '';
  modalInitialEnd.value = '';
  modalSaveError.value = '';
  vacationModalOpen.value = true;
}

function openEditVacation(
  bar: VacationBarSegment,
  user: User,
): void {
  modalMode.value = 'edit';
  modalVacationId.value = bar.vacationId;
  modalUserId.value = user._id;
  modalInitialStart.value = bar.startDate;
  modalInitialEnd.value = bar.endDate;
  modalSaveError.value = '';
  vacationModalOpen.value = true;
}

function openRemoveVacation(bar: VacationBarSegment, user: User): void {
  pendingRemoval.value = {
    vacationId: bar.vacationId,
    label: `${user.fullName}: ${formatCalendarDateRu(bar.startDate)} — ${formatCalendarDateRu(bar.endDate)}`,
  };
  confirmOpen.value = true;
}

async function onVacationModalSave(payload: {
  userId: string;
  startDate: string;
  endDate: string;
  vacationId?: string;
}): Promise<void> {
  modalSaveError.value = '';
  modalSaving.value = true;
  try {
    if (payload.vacationId) {
      await vacationsStore.updateVacation(payload.vacationId, {
        startDate: payload.startDate,
        endDate: payload.endDate,
      });
    } else {
      await vacationsStore.createVacation({
        userId: payload.userId,
        startDate: payload.startDate,
        endDate: payload.endDate,
      });
    }
    vacationModalOpen.value = false;
    clearSelectedBar();
    await load();
  } catch (e) {
    modalSaveError.value = getApiErrorMessage(e, 'Не удалось сохранить отпуск');
  } finally {
    modalSaving.value = false;
  }
}

async function confirmRemoveVacation(): Promise<void> {
  if (!pendingRemoval.value) return;
  confirmLoading.value = true;
  try {
    await vacationsStore.deleteVacation(pendingRemoval.value.vacationId);
    confirmOpen.value = false;
    pendingRemoval.value = null;
    clearSelectedBar();
    await load();
  } catch (e) {
    modalSaveError.value = getApiErrorMessage(e, 'Не удалось удалить отпуск');
  } finally {
    confirmLoading.value = false;
  }
}

watch(vacationModalOpen, (open) => {
  if (!open) {
    modalSaveError.value = '';
  }
});
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="График отпусков"
      subtitle="Все участники команды и их отпуска по месяцам. Красная обводка — два и более человека одной роли в отпуске одновременно."
    >
      <template v-if="canManageVacations" #actions>
        <AppButton type="button" variant="primary" @click="openCreateVacation">
          Добавить отпуск
        </AppButton>
      </template>
    </AppPageHeader>

    <AppState
      v-if="!teamId"
      title="Выбери команду в шапке"
      description="После выбора команды отобразится годовой график отпусков всех участников."
      tone="empty"
    />

    <template v-else>
      <div class="card">
        <div class="toolbar schedule-toolbar">
          <div class="field">
            <span class="field__label">Год</span>
            <div class="year-switcher">
              <AppButton type="button" @click="prevYear">←</AppButton>
              <span class="year-switcher__value">{{ year }}</span>
              <AppButton type="button" @click="nextYear">→</AppButton>
            </div>
          </div>

          <div class="field">
            <AppSwitch v-model="showOnlyConflicts">
              Только пересечения
            </AppSwitch>
          </div>

          <div class="field">
            <AppSwitch v-model="showOnlyLaborIssues">
              Только нарушения ТК
            </AppSwitch>
          </div>

          <div class="field field--grow role-filter">
            <span class="field__label">Фильтр по роли</span>
            <div class="role-filter__chips">
              <AppButton
                v-if="roleFilter.size > 0"
                type="button"
                @click="clearRoleFilter"
              >
                Все роли
              </AppButton>
              <button
                v-for="opt in JOB_ROLE_OPTIONS"
                :key="opt.value"
                type="button"
                class="role-chip"
                :class="{ 'role-chip--active': roleFilter.has(opt.value) }"
                @click="toggleRoleFilter(opt.value)"
              >
                <span
                  class="role-chip__dot"
                  :style="{ backgroundColor: JOB_ROLE_COLORS[opt.value] }"
                />
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="selectedBar"
          class="vacation-detail card"
          role="region"
          aria-label="Детали отпуска"
        >
          <div class="vacation-detail__head">
            <h2 class="vacation-detail__title">{{ selectedBar.user.fullName }}</h2>
            <div class="vacation-detail__actions">
              <template v-if="canManageVacations">
                <AppButton
                  type="button"
                  @click="openEditVacation(selectedBar.bar, selectedBar.user)"
                >
                  Изменить
                </AppButton>
                <AppButton
                  type="button"
                  @click="openRemoveVacation(selectedBar.bar, selectedBar.user)"
                >
                  Удалить
                </AppButton>
              </template>
              <AppButton type="button" @click="clearSelectedBar">Закрыть</AppButton>
            </div>
          </div>
          <p class="vacation-detail__meta">
            <span class="vacation-detail__role">{{ jobRoleLabel(selectedBar.user.jobRole) }}</span>
            <span>
              {{ formatCalendarDateRu(selectedBar.bar.startDate) }}
              —
              {{ formatCalendarDateRu(selectedBar.bar.endDate) }}
            </span>
            <span class="vacation-detail__days">
              {{ vacationDurationDays(selectedBar.bar.startDate, selectedBar.bar.endDate) }}
              дн.
            </span>
          </p>
          <p
            v-if="selectedBar.bar.hasConflict"
            class="vacation-detail__conflict"
          >
            Есть пересечение по роли
          </p>
          <template v-if="selectedBarLaborCompliance">
            <p class="vacation-detail__labor">
              {{ complianceDetailRu(selectedBarLaborCompliance) }}
            </p>
            <ul
              v-if="selectedBarLaborCompliance.issues.length > 0"
              class="vacation-detail__labor-issues"
            >
              <li
                v-for="(issue, index) in selectedBarLaborCompliance.issues"
                :key="index"
              >
                {{ issue }}
              </li>
            </ul>
          </template>
        </div>

        <div class="schedule-legend">
          <p class="schedule-legend__title">Легенда</p>
          <ul class="schedule-legend__list">
            <li
              v-for="opt in JOB_ROLE_OPTIONS"
              :key="opt.value"
              class="schedule-legend__item"
            >
              <span
                class="schedule-legend__swatch"
                :style="{ backgroundColor: JOB_ROLE_COLORS[opt.value] }"
              />
              {{ opt.label }}
            </li>
            <li class="schedule-legend__item">
              <span class="schedule-legend__swatch schedule-legend__swatch--muted" />
              Роль не указана
            </li>
            <li class="schedule-legend__item">
              <span class="schedule-legend__swatch schedule-legend__swatch--nwd" />
              Нерабочий день
            </li>
            <li class="schedule-legend__item schedule-legend__item--conflict">
              <span class="schedule-legend__swatch schedule-legend__swatch--conflict" />
              Пересечение внутри роли
            </li>
            <li class="schedule-legend__item schedule-legend__item--labor">
              <span class="schedule-legend__swatch schedule-legend__swatch--labor" />
              Нарушение нормы ТК (28 дн., один период ≥14)
            </li>
          </ul>
        </div>

        <AppState
          v-if="isLoading"
          title="Загружаем график"
          description="Подтягиваем участников и периоды отпусков."
          compact
        />
        <AppState
          v-else-if="loadError"
          title="Не удалось загрузить данные"
          :description="loadError"
          tone="error"
        >
          <template #actions>
            <AppButton type="button" variant="primary" @click="load">
              Повторить
            </AppButton>
          </template>
        </AppState>
        <template v-else>
          <VacationScheduleConflicts
            :ranges="conflictRanges"
            @focus="focusConflictParticipants"
          />

          <AppState
            v-if="visibleRows.length === 0"
            title="Нет участников для отображения"
            :description="emptyStateDescription"
            tone="empty"
          />
          <VacationScheduleGrid
            v-else
            :rows="visibleRows"
            :year="year"
            :conflict-months="conflictMonths"
            :non-working-segments="nonWorkingSegments"
            :highlighted-user-ids="highlightedUserIds"
            :compliance-by-user-id="complianceByUserId"
            :can-manage-vacations="canManageVacations"
            @bar-select="selectBar"
            @edit-vacation="({ bar, user }) => openEditVacation(bar, user)"
            @remove-vacation="({ bar, user }) => openRemoveVacation(bar, user)"
          />
        </template>
      </div>
    </template>

    <VacationPeriodModal
      v-model="vacationModalOpen"
      v-model:user-id="modalUserId"
      :mode="modalMode"
      :year="year"
      :vacations="vacationsStore.vacations"
      :users="usersStore.users"
      :vacation-id="modalVacationId ?? undefined"
      :participant-label="modalParticipantLabel"
      :initial-start="modalInitialStart"
      :initial-end="modalInitialEnd"
      :saving="modalSaving"
      :save-error="modalSaveError"
      @save="onVacationModalSave"
    />

    <AppConfirmModal
      v-model="confirmOpen"
      title="Удалить отпуск?"
      :description="
        pendingRemoval
          ? `Период ${pendingRemoval.label} будет удалён без возможности быстрого восстановления.`
          : 'Период будет удалён.'
      "
      confirm-label="Удалить"
      tone="danger"
      :loading="confirmLoading"
      @confirm="confirmRemoveVacation"
    />
  </section>
</template>

<style scoped lang="scss">
.schedule-toolbar {
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.year-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.year-switcher__value {
  min-width: 3.5rem;
  text-align: center;
  font-weight: 700;
  font-size: 1.1rem;
}

.role-filter__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 999px;
  background: var(--surface);
  font-size: 0.8rem;
  cursor: pointer;
  color: inherit;
}

.role-chip--active {
  border-color: var(--accent, #0d9488);
  background: rgba(13, 148, 136, 0.08);
}

.role-chip__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.vacation-detail {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md);
  background: var(--surface-muted, #f8fafc);
}

.vacation-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
}

.vacation-detail__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.vacation-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.vacation-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.vacation-detail__role {
  font-weight: 600;
  color: var(--text, inherit);
}

.vacation-detail__days {
  font-weight: 600;
  color: var(--text, inherit);
}

.vacation-detail__conflict {
  margin: var(--space-2) 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--danger, #dc2626);
}

.vacation-detail__labor {
  margin: var(--space-2) 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.vacation-detail__labor-issues {
  margin: 0.35rem 0 0;
  padding-left: 1.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #a16207;
}

.schedule-legend__item--labor {
  color: #a16207;
}

.schedule-legend__swatch--labor {
  background: rgba(234, 179, 8, 0.35);
  border: 1px solid #ca8a04;
}

.schedule-legend {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border, #e2e8f0);
}

.schedule-legend__title {
  margin: 0 0 var(--space-2);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}

.schedule-legend__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.schedule-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.schedule-legend__item--conflict {
  color: var(--danger, #dc2626);
}

.schedule-legend__swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  flex-shrink: 0;
}

.schedule-legend__swatch--muted {
  background: #94a3b8;
}

.schedule-legend__swatch--nwd {
  background: rgba(148, 163, 184, 0.35);
}

.schedule-legend__swatch--conflict {
  background: transparent;
  border: 2px solid var(--danger, #dc2626);
  width: 0.65rem;
  height: 0.65rem;
}
</style>
