<script setup lang="ts">
import { computed, mergeProps, useAttrs } from 'vue';

defineOptions({
  inheritAttrs: false,
});

interface Props {
  modelValue: boolean;
  disabled?: boolean;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  change: [value: boolean];
}>();

const attrs = useAttrs();

const tabIndex = computed(() => (props.disabled ? -1 : 0));

const isAriaDisabled = computed(
  () => props.disabled || props.loading,
);

const stateClass = computed(() => ({
  'app-switch--on': props.modelValue,
  'app-switch--disabled': props.disabled,
  'app-switch--loading': props.loading,
}));

function emitToggle(): void {
  if (props.disabled || props.loading) {
    return;
  }
  const next = !props.modelValue;
  emit('update:modelValue', next);
  emit('change', next);
}

function handleLabelClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  emitToggle();
}

function onKeyboardToggle(): void {
  emitToggle();
}

const labelBind = computed(() =>
  mergeProps(attrs, {
    onClick: handleLabelClick,
  }),
);
</script>

<template>
  <label
    class="app-switch"
    :class="stateClass"
    :tabindex="tabIndex"
    :aria-disabled="isAriaDisabled"
    role="switch"
    :aria-checked="modelValue"
    v-bind="labelBind"
    @keyup.enter="onKeyboardToggle"
    @keyup.space.prevent="onKeyboardToggle"
  >
    <input
      class="app-switch__checkbox"
      type="checkbox"
      :checked="modelValue"
      tabindex="-1"
      :disabled="disabled || loading"
    />
    <span class="app-switch__track" aria-hidden="true">
      <span class="app-switch__thumb">
        <span v-if="loading" class="app-switch__spinner" />
      </span>
    </span>
    <span v-if="$slots.default" class="app-switch__label">
      <slot />
    </span>
  </label>
</template>

<style scoped lang="scss">
.app-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
  font-size: var(--font-size-xs);
  color: var(--muted);
}

.app-switch:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.app-switch__checkbox {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.app-switch__track {
  position: relative;
  flex-shrink: 0;
  width: 2.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: #e5e7eb;
  border: 1px solid var(--border);
  transition:
    background var(--ease-out),
    border-color var(--ease-out);
}

.app-switch--on .app-switch__track {
  background: var(--accent);
  border-color: transparent;
}

.app-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(1.25rem - 6px);
  height: calc(1.25rem - 6px);
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
  transition: transform var(--ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-switch--on .app-switch__thumb {
  transform: translateX(1rem);
}

.app-switch__label {
  line-height: 1.3;
}

.app-switch--disabled,
.app-switch--loading {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-switch__spinner {
  width: 0.55rem;
  height: 0.55rem;
  border: 2px solid rgb(0 0 0 / 15%);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: app-switch-spin 0.65s linear infinite;
}

@keyframes app-switch-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
