<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'default' | 'primary' | 'danger';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  type: 'button',
  disabled: false,
});

const variantClass = computed(() => {
  if (props.variant === 'primary') return 'btn--primary';
  if (props.variant === 'danger') return 'btn--danger';
  return '';
});
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="variantClass"
    :disabled="disabled"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 2.75rem;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--btn-secondary);
  color: var(--text);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background var(--ease-out),
    border-color var(--ease-out),
    color var(--ease-out),
    box-shadow var(--ease-out);
}

.btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.btn:active:not(:disabled) {
  background: #e5e7eb;
}

.btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent);
  outline-offset: var(--focus-ring-offset);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn:disabled:hover {
  background: var(--btn-secondary);
  border-color: var(--border);
}

.btn--primary {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: transparent;
}

.btn--primary:active:not(:disabled) {
  background: #115e59;
}

.btn--primary:disabled:hover {
  background: var(--accent);
}

.btn--danger {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.btn--danger:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
}

.btn--danger:active:not(:disabled) {
  background: #fecaca;
}

.btn--danger:disabled:hover {
  background: #fef2f2;
  border-color: #fecaca;
}

@media (max-width: 720px) {
  .btn {
    width: 100%;
  }
}
</style>
