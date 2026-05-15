<script setup lang="ts">
import { jobRoleLabel } from '@/constants/userJobRoles';
import { formatCalendarDateRu } from '@/utils/dates';

import type { ConflictRange } from '@/utils/vacationSchedule';

interface VacationScheduleConflictsProps {
  ranges: ConflictRange[];
}

defineProps<VacationScheduleConflictsProps>();

const emit = defineEmits<{
  focus: [userIds: string[]];
}>();

function formatRange(start: string, end: string): string {
  if (start === end) {
    return formatCalendarDateRu(start);
  }
  return `${formatCalendarDateRu(start)} — ${formatCalendarDateRu(end)}`;
}
</script>

<template>
  <section class="conflicts-panel">
    <div class="conflicts-panel__head">
      <h2 class="conflicts-panel__title">Пересечения по ролям</h2>
      <span class="conflicts-panel__count">{{ ranges.length }}</span>
    </div>

    <p v-if="ranges.length === 0" class="conflicts-panel__empty">
      Пересечений в этом году нет.
    </p>

    <ul v-else class="conflicts-panel__list">
      <li v-for="(range, index) in ranges" :key="`${range.role}-${range.start}-${index}`">
        <button
          type="button"
          class="conflicts-panel__card"
          @click="emit('focus', range.participants.map((p) => p.userId))"
        >
          <span class="conflicts-panel__dates">{{ formatRange(range.start, range.end) }}</span>
          <span class="conflicts-panel__role">{{ jobRoleLabel(range.role) }}</span>
          <span class="conflicts-panel__names">
            {{ range.participants.map((p) => p.fullName).join(', ') }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.conflicts-panel {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border, #e2e8f0);
}

.conflicts-panel__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.conflicts-panel__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.conflicts-panel__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger, #dc2626);
  font-size: 0.75rem;
  font-weight: 700;
}

.conflicts-panel__empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.conflicts-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.conflicts-panel__card {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.75rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  color: inherit;
  transition:
    border-color var(--ease-out),
    background var(--ease-out);
}

.conflicts-panel__card:hover {
  border-color: rgba(220, 38, 38, 0.45);
  background: rgba(220, 38, 38, 0.04);
}

.conflicts-panel__dates {
  font-weight: 600;
  font-size: 0.85rem;
}

.conflicts-panel__role {
  font-size: 0.8rem;
  color: var(--muted);
}

.conflicts-panel__names {
  flex: 1 1 100%;
  font-size: 0.85rem;
}
</style>
