<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import AppButton from '@/components/UI/AppButton.vue';
import AppDatePicker from '@/components/UI/AppDatePicker.vue';
import AppModal from '@/components/UI/AppModal.vue';

interface VacationPeriodModalProps {
  modelValue: boolean;
  mode: 'create' | 'edit';
  vacationId?: string;
  participantLabel?: string;
  initialStart?: string;
  initialEnd?: string;
  saving?: boolean;
  /** Ошибка с сервера при сохранении (из родителя) */
  saveError?: string;
}

const props = withDefaults(defineProps<VacationPeriodModalProps>(), {
  vacationId: undefined,
  participantLabel: '',
  initialStart: '',
  initialEnd: '',
  saving: false,
  saveError: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [payload: { startDate: string; endDate: string; vacationId?: string }];
}>();

const startDate = ref('');
const endDate = ref('');
const localError = ref<string | null>(null);

const modalTitle = computed(() =>
  props.mode === 'edit' ? 'Изменить отпуск' : 'Добавить отпуск',
);

const endMin = computed(() => startDate.value.trim() || undefined);

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
  const payload: { startDate: string; endDate: string; vacationId?: string } = {
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
    <p v-if="participantLabel" class="modal-intro">
      {{ participantLabel }}
    </p>
    <p class="modal-hint">
      Даты в поле — в формате день.месяц.год; на сервер уходит календарный день
      без сдвига timezone.
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

.error {
  margin: var(--space-2) 0 0;
  color: var(--danger);
  font-size: 0.875rem;
}
</style>
