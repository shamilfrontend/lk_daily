<script setup lang="ts">
import AppButton from '@/components/UI/AppButton.vue';
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
        <AppButton type="button" :disabled="loading" @click="emit('update:modelValue', false)">
          {{ cancelLabel }}
        </AppButton>
        <AppButton
          type="button"
          :variant="tone === 'danger' ? 'danger' : 'primary'"
          :disabled="loading"
          @click="emit('confirm')"
        >
          {{ loading ? 'Секунду…' : confirmLabel }}
        </AppButton>
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
