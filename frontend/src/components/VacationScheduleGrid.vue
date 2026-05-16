<script setup lang="ts">
import { computed } from 'vue';

import AppContextMenu from '@/components/UI/AppContextMenu.vue';
import { jobRoleLabel } from '@/constants/userJobRoles';
import {
  isFirstRowInRoleGroup,
  isUserOnMaternityLeave,
} from '@/utils/vacationSchedule';
import {
  formatVacationRangeRu,
  formatVacationRangeShortRu,
} from '@/utils/dates';

import type {
  ScheduleParticipantRow,
  TimelineSegment,
  VacationBarSegment,
} from '@/utils/vacationSchedule';
import { MONTH_LABELS_SHORT } from '@/utils/vacationSchedule';

import type { LaborVacationCompliance } from '@/utils/vacationLaborCompliance';
import { complianceSummaryRu } from '@/utils/vacationLaborCompliance';

import type { User } from '@/types/api';

interface VacationScheduleGridProps {
  rows: ScheduleParticipantRow[];
  year: number;
  conflictMonths: Set<number>;
  nonWorkingSegments: TimelineSegment[];
  highlightedUserIds: Set<string>;
  complianceByUserId?: Map<string, LaborVacationCompliance>;
  canManageVacations?: boolean;
}

const props = withDefaults(defineProps<VacationScheduleGridProps>(), {
  complianceByUserId: () => new Map(),
  canManageVacations: false,
});

function laborComplianceFor(userId: string): LaborVacationCompliance | undefined {
  return props.complianceByUserId.get(userId);
}

function laborBadgeTitle(compliance: LaborVacationCompliance): string {
  if (compliance.isCompliant) {
    return `Норма ТК: ${compliance.totalDays} календарных дней в ${props.year} году`;
  }
  return compliance.issues.join('. ');
}

const emit = defineEmits<{
  barSelect: [payload: { bar: VacationBarSegment; user: User }];
  editVacation: [payload: { bar: VacationBarSegment; user: User }];
  removeVacation: [payload: { bar: VacationBarSegment; user: User }];
}>();

const monthHeaders = computed(() =>
  MONTH_LABELS_SHORT.map((label, index) => ({
    label,
    index,
    hasConflict: props.conflictMonths.has(index),
  })),
);

function isRowHighlighted(userId: string): boolean {
  return props.highlightedUserIds.size > 0 && props.highlightedUserIds.has(userId);
}

function onBarClick(bar: VacationBarSegment, user: User): void {
  emit('barSelect', { bar, user });
}

/** Подпись на полосе, если ширина позволяет (~3+ недели в году). */
function showBarLabel(bar: VacationBarSegment): boolean {
  return bar.widthPercent >= 4.5;
}

function onPeriodMenuSelect(
  actionId: string,
  bar: VacationBarSegment,
  user: User,
): void {
  if (actionId === 'edit') {
    emit('editVacation', { bar, user });
  } else if (actionId === 'remove') {
    emit('removeVacation', { bar, user });
  }
}
</script>

<template>
  <div class="schedule-grid-wrap table-wrap">
    <table class="schedule-grid table">
      <thead>
        <tr>
          <th class="schedule-grid__name-col">Участник</th>
          <th
            v-for="month in monthHeaders"
            :key="month.index"
            class="schedule-grid__month-col"
            :class="{ 'schedule-grid__month-col--conflict': month.hasConflict }"
          >
            <span>{{ month.label }}</span>
            <span
              v-if="month.hasConflict"
              class="schedule-grid__conflict-dot"
              title="Нарушение правил роли"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, rowIndex) in rows" :key="row.user._id">
          <tr
            v-if="isFirstRowInRoleGroup(rows, rowIndex)"
            class="schedule-grid__role-group"
          >
            <th
              scope="row"
              colspan="13"
              class="schedule-grid__role-group-cell"
            >
              {{ jobRoleLabel(row.user.jobRole) }}
            </th>
          </tr>
          <tr
            :class="{
              'schedule-grid__row--highlight': isRowHighlighted(row.user._id),
              'schedule-grid__row--maternity': isUserOnMaternityLeave(row.user),
              'schedule-grid__row--labor-warn':
                !isUserOnMaternityLeave(row.user) &&
                laborComplianceFor(row.user._id) &&
                !laborComplianceFor(row.user._id)!.isCompliant &&
                laborComplianceFor(row.user._id)!.periodCount > 0,
            }"
          >
          <th scope="row" class="schedule-grid__name-col">
            <span class="schedule-grid__name">{{ row.user.fullName }}</span>
            <template v-if="isUserOnMaternityLeave(row.user)">
              <span class="schedule-grid__maternity">В декретном отпуске</span>
            </template>
            <template v-else>
            <span
              v-if="laborComplianceFor(row.user._id)"
              class="schedule-grid__labor"
              :class="{
                'schedule-grid__labor--warn':
                  !laborComplianceFor(row.user._id)!.isCompliant &&
                  laborComplianceFor(row.user._id)!.periodCount > 0,
              }"
              :title="laborBadgeTitle(laborComplianceFor(row.user._id)!)"
            >
              ТК: {{ complianceSummaryRu(laborComplianceFor(row.user._id)!) }}
            </span>
            <ul v-if="row.bars.length > 0" class="schedule-grid__periods">
              <li
                v-for="bar in row.bars"
                :key="bar.vacationId"
                class="schedule-grid__period-row"
                :class="{ 'schedule-grid__period--conflict': bar.hasConflict }"
              >
                <span class="schedule-grid__period">
                  {{ formatVacationRangeRu(bar.startDate, bar.endDate) }}
                </span>
                <AppContextMenu
                  v-if="canManageVacations"
                  trigger-size="compact"
                  :trigger-label="`Действия: ${formatVacationRangeRu(bar.startDate, bar.endDate)}`"
                  :items="[
                    { id: 'edit', label: 'Изменить' },
                    { id: 'remove', label: 'Удалить', danger: true },
                  ]"
                  @select="(id) => onPeriodMenuSelect(String(id), bar, row.user)"
                />
              </li>
            </ul>
            <span v-else class="schedule-grid__no-periods">Нет отпусков в году</span>
            </template>
          </th>
          <td :colspan="12" class="schedule-grid__timeline-cell">
            <div
              class="schedule-grid__timeline"
              :aria-label="
                isUserOnMaternityLeave(row.user)
                  ? `В декретном отпуске, ${row.user.fullName}, ${year}`
                  : `Отпуска ${row.user.fullName} за ${year}`
              "
            >
              <div
                v-for="(segment, segIndex) in nonWorkingSegments"
                :key="`nwd-${segIndex}`"
                class="schedule-grid__nwd"
                :style="{
                  left: `${segment.leftPercent}%`,
                  width: `${segment.widthPercent}%`,
                }"
              />
              <div
                v-for="month in monthHeaders"
                :key="month.index"
                class="schedule-grid__month-divider"
                :style="{ left: `${(month.index / 12) * 100}%` }"
              />
              <button
                v-for="bar in row.bars"
                :key="bar.vacationId"
                type="button"
                class="schedule-grid__bar"
                :class="{
                  'schedule-grid__bar--conflict': bar.hasConflict,
                  'schedule-grid__bar--labeled': showBarLabel(bar),
                }"
                :style="{
                  left: `${bar.leftPercent}%`,
                  width: `${bar.widthPercent}%`,
                  backgroundColor: bar.color,
                }"
                :title="formatVacationRangeRu(bar.startDate, bar.endDate)"
                @click="onBarClick(bar, row.user)"
              >
                <span v-if="showBarLabel(bar)" class="schedule-grid__bar-label">
                  {{ formatVacationRangeShortRu(bar.startDate, bar.endDate) }}
                </span>
              </button>
            </div>
          </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
.schedule-grid-wrap {
  margin-top: var(--space-3);
}

.schedule-grid {
  min-width: 56rem;
  table-layout: fixed;
}

.schedule-grid__name-col {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 14rem;
  min-width: 14rem;
  background: var(--surface);
  vertical-align: top;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.schedule-grid__row--highlight .schedule-grid__name-col {
  background: rgba(13, 148, 136, 0.08);
}

.schedule-grid__row--highlight {
  background: rgba(13, 148, 136, 0.04);
}

.schedule-grid__row--labor-warn .schedule-grid__name-col {
  background: rgba(234, 179, 8, 0.1);
}

.schedule-grid__row--labor-warn {
  background: rgba(234, 179, 8, 0.04);
}

.schedule-grid__labor {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--muted);
  background: var(--surface-muted, #f1f5f9);
  border-radius: var(--radius-sm);
}

.schedule-grid__labor--warn {
  color: #a16207;
  background: rgba(234, 179, 8, 0.18);
}

.schedule-grid__role-group-cell {
  padding: 0.45rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: left;
  color: var(--muted);
  background: var(--surface-muted, #f1f5f9);
  border-top: 1px solid var(--border, #e2e8f0);
}

.schedule-grid__role-group:first-child .schedule-grid__role-group-cell {
  border-top: none;
}

.schedule-grid__month-col {
  width: calc((100% - 14rem) / 12);
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  padding: 0.35rem 0.15rem;
}

.schedule-grid__month-col--conflict {
  color: var(--danger, #dc2626);
}

.schedule-grid__conflict-dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  margin-left: 0.2rem;
  border-radius: 50%;
  background: var(--danger, #dc2626);
  vertical-align: middle;
}

.schedule-grid__name {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
}

.schedule-grid__role {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.7rem;
}

.badge--role {
  background: rgba(13, 148, 136, 0.12);
  color: var(--accent, #0d9488);
}

.badge--muted {
  background: var(--surface-muted, #f1f5f9);
  color: var(--muted);
}

.schedule-grid__periods {
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
}

.schedule-grid__period-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin-top: 0.15rem;
}

.schedule-grid__period {
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--muted);
}

.schedule-grid__period-row.schedule-grid__period--conflict .schedule-grid__period {
  color: var(--danger, #dc2626);
  font-weight: 600;
}

.schedule-grid__no-periods {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: var(--muted);
  font-style: italic;
}

.schedule-grid__maternity {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  font-style: italic;
}

.schedule-grid__row--maternity .schedule-grid__name-col {
  background: rgba(148, 163, 184, 0.12);
}

.schedule-grid__row--maternity {
  background: rgba(148, 163, 184, 0.05);
}

.schedule-grid__timeline-cell {
  padding: 0.5rem 0.35rem;
}

.schedule-grid__timeline {
  position: relative;
  height: 2.25rem;
  border-radius: var(--radius-sm);
  background: var(--surface-muted, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  overflow: hidden;
}

.schedule-grid__nwd {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(148, 163, 184, 0.22);
  pointer-events: none;
  z-index: 0;
}

.schedule-grid__month-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(148, 163, 184, 0.35);
  pointer-events: none;
  z-index: 1;
}

.schedule-grid__bar {
  position: absolute;
  top: 0.2rem;
  bottom: 0.2rem;
  min-width: 2px;
  padding: 0 0.15rem;
  border: none;
  border-radius: 2px;
  opacity: 0.92;
  cursor: pointer;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.schedule-grid__bar-label {
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.1;
  color: #fff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
  pointer-events: none;
}

.schedule-grid__bar--labeled {
  min-width: 3.5rem;
}

.schedule-grid__bar--conflict {
  box-shadow:
    inset 0 0 0 2px var(--danger, #dc2626),
    0 0 0 1px rgba(220, 38, 38, 0.35);
}

.schedule-grid__bar:hover {
  opacity: 1;
  filter: brightness(1.05);
}
</style>
