<script setup lang="ts">
import AppModal from '@/components/UI/AppModal.vue';

withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
    loading?: boolean;
  }>(),
  {
    description: '',
    confirmLabel: 'Подтвердить',
    cancelLabel: 'Отмена',
    tone: 'default',
    loading: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
}>();
</script>

<template>
  <AppModal
    :model-value="modelValue"
    :title="title"
    size="sm"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="confirm-modal">
      <p class="confirm-modal__description">{{ description }}</p>
      <div class="confirm-modal__actions">
        <button
          type="button"
          class="btn"
          :disabled="loading"
          @click="emit('update:modelValue', false)"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          class="btn"
          :class="tone === 'danger' ? 'btn--danger' : 'btn--primary'"
          :disabled="loading"
          @click="emit('confirm')"
        >
          {{ loading ? 'Секунду…' : confirmLabel }}
        </button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped lang="scss">
.confirm-modal {
  display: grid;
  gap: var(--space-3);
}

.confirm-modal__description {
  margin: 0;
  color: var(--text);
}

.confirm-modal__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
