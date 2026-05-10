<script setup lang="ts">
import { computed } from 'vue';
import type {
  HolidayTransferItem,
  NonWorkingItem,
  NonWorkingItemType,
} from '@/types/api';

interface ProductionYearCalendarProps {
	year: number;
	items: NonWorkingItem[];
	transfers: HolidayTransferItem[];
}

const props = defineProps<ProductionYearCalendarProps>();

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

const TYPE_LABEL_RU: Record<NonWorkingItemType, string> = {
  federal: 'федеральный',
  regional: 'региональный',
  transfer: 'перенос',
  custom: 'пользовательский',
};

/** Понедельник = 0 … воскресенье = 6, по календарной дате Y-M-D (UTC). */
function weekdayMonZero(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (wd + 6) % 7;
}

function daysInMonth(y: number, monthIndex: number): number {
  return new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatRuLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const monthName = MONTHS[m - 1];
  return `${d} ${monthName?.toLowerCase() ?? String(m)} ${y}`;
}

const PRIORITY: Record<NonWorkingItemType, number> = {
  custom: 4,
  regional: 3,
  transfer: 2,
  federal: 1,
};

const eventsByDate = computed(() => {
  const m = new Map<string, NonWorkingItem[]>();
  for (const it of props.items) {
    const list = m.get(it.date) ?? [];
    list.push(it);
    m.set(it.date, list);
  }
  return m;
});

const transferFromSet = computed(
  () => new Set(props.transfers.map((t) => t.fromDate)),
);

function primaryTypeForDate(dateStr: string): NonWorkingItemType | null {
  const list = eventsByDate.value.get(dateStr);
  if (!list?.length) return null;
  let best: NonWorkingItemType = list[0].type;
  let p = PRIORITY[best];
  for (const it of list.slice(1)) {
    const q = PRIORITY[it.type];
    if (q > p) {
      p = q;
      best = it.type;
    }
  }
  return best;
}

function titleForDate(dateStr: string): string {
  const parts: string[] = [];
  if (transferFromSet.value.has(dateStr)) {
    const tr = props.transfers.find((t) => t.fromDate === dateStr);
    parts.push(
      tr?.description
        ? `Перенос: ${tr.description}`
        : 'Исходный день переноса (рабочий)',
    );
  }
  const list = eventsByDate.value.get(dateStr);
  if (list?.length) {
    for (const it of list) {
      const typeRu = TYPE_LABEL_RU[it.type];
      const label = it.description ? `${typeRu}: ${it.description}` : typeRu;
      parts.push(label);
    }
  }
  return parts.join(' · ') || dateStr;
}

function ariaLabelForDate(dateStr: string): string {
  const human = formatRuLongDate(dateStr);
  const t = titleForDate(dateStr);
  if (t === dateStr || !t) {
    if (isWeekend(dateStr) && !primaryTypeForDate(dateStr)) {
      return `${human}, выходной день`;
    }
    return `${human}, рабочий день`;
  }
  return `${human}. ${t}`;
}

function isWeekend(dateStr: string): boolean {
  const w = weekdayMonZero(dateStr);
  return w >= 5;
}

function cellClass(dateStr: string): string {
  const classes = ['cal__cell'];
  const primary = primaryTypeForDate(dateStr);
  if (primary) {
    classes.push(`cal__cell--${primary}`);
  } else if (isWeekend(dateStr)) {
    classes.push('cal__cell--weekend');
  }
  if (transferFromSet.value.has(dateStr)) {
    classes.push('cal__cell--transfer-from');
  }
  return classes.join(' ');
}

const monthsData = computed(() => {
  const y = props.year;
  return MONTHS.map((name, mi) => {
    const dim = daysInMonth(y, mi);
    const firstStr = `${y}-${pad(mi + 1)}-01`;
    const lead = weekdayMonZero(firstStr);
    const cells: ({ dateStr: string; n: number } | null)[] = [];
    for (let i = 0; i < lead; i += 1) {
      cells.push(null);
    }
    for (let d = 1; d <= dim; d += 1) {
      const dateStr = `${y}-${pad(mi + 1)}-${pad(d)}`;
      cells.push({ dateStr, n: d });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const weeks: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return { name, weeks };
  });
});
</script>

<template>
  <div class="cal">
    <div class="cal__legend row" aria-label="Легенда">
      <span><span class="cal__swatch cal__swatch--federal" />федеральный</span>
      <span
        ><span class="cal__swatch cal__swatch--transfer" />перенос
        (выходной)</span
      >
      <span
        ><span class="cal__swatch cal__swatch--regional" />региональный</span
      >
      <span
        ><span class="cal__swatch cal__swatch--custom" />пользовательский</span
      >
      <span><span class="cal__swatch cal__swatch--weekend" />выходной</span>
      <span
        ><span class="cal__swatch cal__swatch--transfer-from" />день переноса
        (рабочий)</span
      >
    </div>

    <div class="cal__months">
      <div v-for="block in monthsData" :key="block.name" class="cal__month">
        <h3 :id="`cal-month-${block.name}-${year}`" class="cal__month-title">
          {{ block.name }}
        </h3>
        <div
          class="cal__grid"
          role="grid"
          :aria-labelledby="`cal-month-${block.name}-${year}`"
          :aria-label="`Календарь: ${block.name} ${year}`"
        >
          <div role="row" class="cal__grid-row">
            <div
              v-for="wd in WEEKDAYS"
              :key="wd"
              role="columnheader"
              class="cal__dow"
            >
              {{ wd }}
            </div>
          </div>
          <div
            v-for="(week, wi) in block.weeks"
            :key="`${block.name}-w${wi}`"
            role="row"
            class="cal__grid-row"
          >
            <div
              v-for="(cell, ci) in week"
              :key="`${block.name}-${wi}-${ci}`"
              :class="
                cell ? cellClass(cell.dateStr) : 'cal__cell cal__cell--empty'
              "
              :role="cell ? 'gridcell' : 'presentation'"
              :aria-hidden="cell ? undefined : true"
              :title="cell ? titleForDate(cell.dateStr) : undefined"
              :aria-label="cell ? ariaLabelForDate(cell.dateStr) : undefined"
            >
              <template v-if="cell">{{ cell.n }}</template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cal__legend {
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  color: var(--muted);

  span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
}

.cal__swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 3px;
  border: 1px solid var(--border);
}

.cal__swatch--federal {
  background: rgba(59, 130, 246, 0.35);
}
.cal__swatch--transfer {
  background: rgba(20, 184, 166, 0.35);
}
.cal__swatch--regional {
  background: rgba(168, 85, 247, 0.3);
}
.cal__swatch--custom {
  background: rgba(245, 158, 11, 0.35);
}
.cal__swatch--weekend {
  background: rgba(107, 114, 128, 0.22);
}
.cal__swatch--transfer-from {
  background: transparent;
  border-style: dashed;
  border-color: var(--ok);
}

.cal__months {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem 1.25rem;
}

.cal__month-title {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.cal__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  font-size: 0.72rem;
}

.cal__grid-row {
  display: contents;
}

.cal__dow {
  text-align: center;
  color: var(--muted);
  padding: 0.15rem 0;
  font-weight: 600;
}

.cal__cell {
  aspect-ratio: 1;
  max-height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: default;
}

.cal__cell--empty {
  visibility: hidden;
  pointer-events: none;
}

.cal__cell--weekend {
  background: rgba(107, 114, 128, 0.1);
  color: var(--muted);
}

.cal__cell--federal {
  background: rgba(59, 130, 246, 0.14);
  color: #1e40af;
}

.cal__cell--transfer {
  background: rgba(20, 184, 166, 0.14);
  color: #0f766e;
}

.cal__cell--regional {
  background: rgba(168, 85, 247, 0.12);
  color: #6b21a8;
}

.cal__cell--custom {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.cal__cell--transfer-from {
  box-shadow: inset 0 0 0 1px rgba(5, 150, 105, 0.55);
  border-style: dashed;
  border-color: rgba(5, 150, 105, 0.45);
}
</style>
