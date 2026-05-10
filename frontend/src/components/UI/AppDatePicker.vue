<script setup lang="ts">
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { ru } from 'date-fns/locale/ru';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import { computed, ref, useAttrs, watch } from 'vue';

defineOptions({ inheritAttrs: false });

dayjs.extend(customParseFormat);

interface Props {
  modelValue?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  required?: boolean;
  autocomplete?: string;
  inputClass?: string;
  size?: 'sm' | 'md';
  invalid?: boolean;
  clearable?: boolean;
  /** Показать системную иконку календаря слева во вводе (Vuepic) */
  showCalendarTrigger?: boolean;
  label?: string;
  /** Сразу применять выбранную дату и закрывать меню */
  autoApply?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  id: undefined,
  name: undefined,
  disabled: false,
  min: undefined,
  max: undefined,
  required: false,
  autocomplete: 'off',
  inputClass: undefined,
  size: 'md',
  invalid: false,
  clearable: false,
  showCalendarTrigger: true,
  label: undefined,
  autoApply: true,
});

const attrs = useAttrs();

const inputStyle = computed(() => attrs.style);

const forwardedForInput = computed(() => {
  const raw = { ...(attrs as Record<string, unknown>) };
  delete raw.class;
  delete raw.style;
  return raw;
});

const inputAttrs = computed(() => {
  const cls = [
    props.inputClass,
    props.invalid ? 'dp__input_invalid' : null,
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);

  return {
    ...forwardedForInput.value,
    id: props.id,
    name: props.name,
    required: props.required,
    autocomplete: props.autocomplete,
    class: cls,
  };
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const internalModel = ref<Date | null>(null);

function parseToDate(s: string): Date | null {
  if (!s?.trim()) return null;
  const d = dayjs(s.trim(), 'YYYY-MM-DD', true);
  return d.isValid() ? d.toDate() : null;
}

function formatFromDate(d: Date): string {
  return dayjs(d).format('YYYY-MM-DD');
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return dayjs(a).isSame(b, 'day');
}

watch(
  () => props.modelValue,
  (s) => {
    const next = parseToDate(typeof s === 'string' ? s : '');
    if (sameDay(internalModel.value, next)) return;
    internalModel.value = next;
  },
  { immediate: true },
);

function onUpdateModelValue(value: unknown): void {
  if (value === null || value === undefined) {
    internalModel.value = null;
    emit('update:modelValue', '');
    return;
  }

  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return;

  internalModel.value = d;
  emit('update:modelValue', formatFromDate(d));
}

const minDate = computed(() =>
  props.min?.trim() ? parseToDate(props.min) : undefined,
);

const maxDate = computed(() =>
  props.max?.trim() ? parseToDate(props.max) : undefined,
);

const rootMod = computed(() => ({
  [`app-datepicker-root--size-${props.size}`]: true,
  'app-datepicker-root--clearable': props.clearable,
  'app-datepicker-root--calendar-trigger': props.showCalendarTrigger,
}));

const rootClass = computed(() => [attrs.class]);
</script>

<template>
  <div
    class="app-datepicker-root dp__theme_light"
    :class="[rootMod, rootClass]"
    :style="inputStyle"
  >
    <label
      v-if="label !== undefined && label !== ''"
      class="app-datepicker-label field__label"
      :for="props.id"
    >
      {{ label }}
    </label>

    <div class="app-datepicker-row">
      <VueDatePicker
        class="app-datepicker-vuepic"
        :model-value="internalModel"
        :auto-apply="autoApply"
        :disabled="disabled"
        :min-date="minDate"
        :max-date="maxDate"
        :locale="ru"
        :text-input="true"
        :time-picker="false"
        :input-attrs="inputAttrs"
        teleport="body"
        @update:model-value="onUpdateModelValue"
      />
      <div v-if="$slots.suffix" class="app-datepicker-slot-suffix">
        <slot name="suffix" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/**
 * Обёртка над @vuepic/vue-datepicker — внешнее API как раньше (строка YYYY-MM-DD).
 * Темизация через --dp-* как в библиотеке: https://github.com/Vuepic/vue-datepicker
 */
.app-datepicker-root {
  --dp-border-radius: var(--radius-sm);
  --dp-font-size: 0.95rem;
  --dp-font-family: inherit;
  --dp-background-color: var(--input-bg);
  --dp-text-color: var(--text);
  --dp-border-color: var(--border);
  --dp-border-color-hover: var(--border-strong);
  --dp-border-color-focus: var(--accent);
  --dp-primary-color: var(--accent);
  --dp-primary-text-color: #fff;
  --dp-secondary-color: var(--muted);
  --dp-icon-color: var(--muted);
  --dp-hover-color: color-mix(in srgb, var(--border) 40%, transparent);
  --dp-hover-text-color: var(--text);
  --dp-hover-icon-color: var(--accent);
  --dp-disabled-color: var(--surface-muted);
  --dp-disabled-color-text: color-mix(in srgb, var(--text) 50%, transparent);
  --dp-menu-border-color: var(--border);
  --dp-danger-color: var(--danger);

  display: grid;
  gap: 0.4rem;
  min-width: 0;
  width: 100%;
}

.app-datepicker-root--size-sm {
  --dp-font-size: var(--font-size-sm);
}

.app-datepicker-label {
  margin: 0;
}

.app-datepicker-row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  min-width: 0;
}

.app-datepicker-vuepic {
  flex: 1;
  min-width: 0;
}

.app-datepicker-slot-suffix {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.app-datepicker-vuepic :deep(.dp__main) {
  width: 100%;
}

.app-datepicker-vuepic :deep(.dp__input_wrap) {
  width: 100%;
}

.app-datepicker-vuepic :deep(.dp__input) {
  min-height: 2.75rem;
  box-shadow: none;
  transition:
    border-color var(--ease-out),
    box-shadow var(--ease-out);
}

.app-datepicker-root--size-sm .app-datepicker-vuepic :deep(.dp__input) {
  min-height: 2.35rem;
}

.app-datepicker-vuepic :deep(.dp__input_focus) {
  box-shadow: 0 0 0 3px var(--focus-ring-color);
}

.app-datepicker-vuepic
  :deep(.dp__input_wrap:focus-within .dp__input:not(.dp__input_invalid)) {
  border-color: var(--accent);
}

/** Без очистки: скрыть крестик */
.app-datepicker-root:not(.app-datepicker-root--clearable)
  :deep(.dp--clear-btn) {
  display: none;
}

/** Без иконки календаря */
.app-datepicker-root:not(.app-datepicker-root--calendar-trigger)
  :deep(.dp__input_icon) {
  display: none;
}

.app-datepicker-root:not(.app-datepicker-root--calendar-trigger):not(
    .app-datepicker-root--clearable
  )
  :deep(.dp__input) {
  padding-inline: 0.85rem;
}
</style>
