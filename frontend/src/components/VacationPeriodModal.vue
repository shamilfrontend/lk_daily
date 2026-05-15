<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import AppButton from '@/components/UI/AppButton.vue';
import AppDatePicker from '@/components/UI/AppDatePicker.vue';
import AppModal from '@/components/UI/AppModal.vue';

import { assessLaborVacationCompliance } from '@/utils/vacationLaborCompliance';

import type { User, Vacation } from '@/types/api';

interface VacationPeriodModalProps {
  modelValue: boolean;
  mode: 'create' | 'edit';
  year?: number;
  vacations?: Vacation[];
  users?: User[];
  userId?: string;
  vacationId?: string;
  participantLabel?: string;
  initialStart?: string;
  initialEnd?: string;
  saving?: boolean;
  saveError?: string;
}

const props = withDefaults(defineProps<VacationPeriodModalProps>(), {
  year: () => new Date().getFullYear(),
  vacations: () => [],
  users: () => [],
  userId: '',
  vacationId: undefined,
  participantLabel: '',
  initialStart: '',
  initialEnd: '',
  saving: false,
  saveError: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:userId': [value: string];
  save: [
    payload: {
      userId: string;
      startDate: string;
      endDate: string;
      vacationId?: string;
    },
  ];
}>();

const startDate = ref('');
const endDate = ref('');
const localError = ref<string | null>(null);

const modalTitle = computed(() =>
  props.mode === 'edit' ? 'Изменить отпуск' : 'Добавить отпуск',
);

const endMin = computed(() => startDate.value.trim() || undefined);

const selectedUserId = computed({
  get: () => props.userId,
  set: (value: string) => emit('update:userId', value),
});

const effectiveUserId = computed(() =>
  props.mode === 'edit' ? props.userId : selectedUserId.value,
);

const laborWarnings = computed(() => {
  const userId = effectiveUserId.value;
  const start = startDate.value.trim();
  const end = endDate.value.trim();
  if (!userId || !start || !end || start > end) {
    return [];
  }
  const result = assessLaborVacationCompliance(
    userId,
    props.vacations,
    props.year,
    {
      vacationId: props.vacationId,
      startDate: start,
      endDate: end,
    },
  );
  return result.issues;
});

function syncFromProps(): void {
  localError.value = null;
  if (props.mode === 'edit' && props.vacationId) {
    startDate.value = props.initialStart?.trim().slice(0, 10) ?? '';
    endDate.value = props.initialEnd?.trim().slice(0, 10) ?? '';
  } else {
    startDate.value = '';
    endDate.value = '';
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      syncFromProps();
    }
  },
);

function close(): void {
  emit('update:modelValue', false);
}

function validate(): boolean {
  localError.value = null;
  if (props.mode === 'create' && !selectedUserId.value) {
    localError.value = 'Выберите участника';
    return false;
  }
  const start = startDate.value.trim();
  const end = endDate.value.trim();
  if (!start || !end) {
    localError.value = 'Укажите дату начала и дату окончания';
    return false;
  }
  if (start > end) {
    localError.value = 'Дата начала не может быть позже даты окончания';
    return false;
  }
  return true;
}

function submit(): void {
  if (!validate()) return;
  const userId =
    props.mode === 'edit'
      ? props.userId
      : selectedUserId.value;
  if (!userId) {
    localError.value = 'Выберите участника';
    return;
  }
  const payload: {
    userId: string;
    startDate: string;
    endDate: string;
    vacationId?: string;
  } = {
    userId,
    startDate: startDate.value.trim(),
    endDate: endDate.value.trim(),
  };
  if (props.mode === 'edit' && props.vacationId) {
    payload.vacationId = props.vacationId;
  }
  emit('save', payload);
}
</script>

<template>
  <AppModal
    :model-value="modelValue"
    :title="modalTitle"
    size="md"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="mode === 'create'" class="field">
      <label class="field__label" for="vacation-user">Участник</label>
      <select
        id="vacation-user"
        v-model="selectedUserId"
        class="select"
        required
      >
        <option value="" disabled>Выберите участника</option>
        <option v-for="user in users" :key="user._id" :value="user._id">
          {{ user.fullName }}
        </option>
      </select>
    </div>
    <p v-else-if="participantLabel" class="modal-intro">
      {{ participantLabel }}
    </p>

    <p class="modal-hint">
      Даты в поле — в формате день.месяц.год; на сервер уходит календарный день
      без сдвига timezone. По ТК РФ: 28 календарных дней в год, один период не
      менее 14 дней.
    </p>

    <div class="field-grid">
      <AppDatePicker
        id="vacation-start"
        v-model="startDate"
        label="Дата начала"
        clearable
      />
      <AppDatePicker
        id="vacation-end"
        v-model="endDate"
        label="Дата окончания"
        clearable
        :min="endMin"
      />
    </div>

    <div v-if="laborWarnings.length > 0" class="modal-warn" role="status">
      <p class="modal-warn__title">Предупреждение по норме ТК</p>
      <ul class="modal-warn__list">
        <li v-for="(warning, index) in laborWarnings" :key="index">
          {{ warning }}
        </li>
      </ul>
    </div>

    <p v-if="localError" class="error">{{ localError }}</p>
    <p v-else-if="saveError" class="error">{{ saveError }}</p>

    <template #footer>
      <AppButton type="button" :disabled="saving" @click="close">
        Отмена
      </AppButton>
      <AppButton
        type="button"
        variant="primary"
        :disabled="saving"
        @click="submit"
      >
        {{ saving ? 'Сохранение…' : 'Сохранить' }}
      </AppButton>
    </template>
  </AppModal>
</template>

<style scoped lang="scss">
.modal-intro {
  margin: 0 0 var(--space-2);
  color: var(--text);
  font-weight: 600;
}

.modal-hint {
  margin: 0 0 var(--space-3);
  font-size: 0.875rem;
  color: var(--muted);
  line-height: 1.4;
}

.field-grid {
  display: grid;
  gap: var(--space-3);
}

.modal-warn {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(202, 138, 4, 0.45);
}

.modal-warn__title {
  margin: 0 0 0.35rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #a16207;
}

.modal-warn__list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.875rem;
  color: #854d0e;
  line-height: 1.45;
}

.error {
  margin: var(--space-2) 0 0;
  color: var(--danger);
  font-size: 0.875rem;
}
</style>
