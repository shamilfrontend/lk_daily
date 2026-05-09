<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    tone?: 'neutral' | 'error' | 'empty';
    compact?: boolean;
  }>(),
  {
    description: '',
    tone: 'neutral',
    compact: false,
  },
);
</script>

<template>
  <div
    class="state-panel"
    :class="[`state-panel--${tone}`, { 'state-panel--compact': compact }]"
  >
    <p class="state-panel__title">{{ title }}</p>
    <p v-if="description" class="state-panel__description">{{ description }}</p>
    <div v-if="$slots.actions" class="state-panel__actions">
      <slot name="actions" />
    </div>
  </div>
</template>
