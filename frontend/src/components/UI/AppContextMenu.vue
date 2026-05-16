<script setup lang="ts">
import { createPopper, type Instance, type Placement } from '@popperjs/core';
import { nextTick, onUnmounted, ref, watch } from 'vue';

export interface AppContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: AppContextMenuItem[];
    placement?: Placement;
    triggerLabel?: string;
    triggerSize?: 'default' | 'compact';
  }>(),
  {
    placement: 'bottom-end',
    triggerLabel: 'Действия',
    triggerSize: 'default',
  },
);

const emit = defineEmits<{
  select: [id: string];
}>();

const menuOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
let popper: Instance | null = null;

function destroyPopper(): void {
  popper?.destroy();
  popper = null;
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null;
  if (!target) return;
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) {
    return;
  }
  menuOpen.value = false;
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    menuOpen.value = false;
  }
}

watch(menuOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    destroyPopper();
    if (triggerRef.value && panelRef.value) {
      popper = createPopper(triggerRef.value, panelRef.value, {
        placement: props.placement,
        modifiers: [
          { name: 'offset', options: { offset: [0, 6] } },
          {
            name: 'flip',
            options: {
              fallbackPlacements: ['top-end', 'top-start', 'bottom-start'],
            },
          },
        ],
      });
    }
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeyDown, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    destroyPopper();
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeyDown, true);
  destroyPopper();
});

function toggleOpen(): void {
  menuOpen.value = !menuOpen.value;
}

function onItemClick(item: AppContextMenuItem): void {
  if (item.disabled) return;
  emit('select', item.id);
  menuOpen.value = false;
}
</script>

<template>
  <div
    class="app-context-menu"
    :class="{ 'app-context-menu--compact': triggerSize === 'compact' }"
  >
    <div
      ref="triggerRef"
      class="app-context-menu__anchor"
      @click.stop="toggleOpen"
    >
      <slot name="trigger">
        <button
          type="button"
          class="app-context-menu__trigger-btn"
          :aria-label="triggerLabel"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
        >
          <span aria-hidden="true" class="app-context-menu__dots">⋯</span>
        </button>
      </slot>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="panelRef"
        class="app-context-menu__panel"
        role="menu"
        :aria-label="triggerLabel"
      >
        <button
          v-for="menuItem in items"
          :key="menuItem.id"
          type="button"
          role="menuitem"
          class="app-context-menu__item"
          :class="{ 'app-context-menu__item--danger': menuItem.danger }"
          :disabled="menuItem.disabled"
          @click="onItemClick(menuItem)"
        >
          {{ menuItem.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.app-context-menu {
  display: inline-flex;
}

.app-context-menu__anchor {
  display: inline-flex;
}

.app-context-menu__trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  min-height: 2.5rem;
  padding: 0 0.45rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--btn-secondary);
  color: var(--text);
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  transition:
    background var(--ease-out),
    border-color var(--ease-out),
    color var(--ease-out);
}

.app-context-menu__trigger-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.app-context-menu__trigger-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent);
  outline-offset: var(--focus-ring-offset);
}

.app-context-menu--compact .app-context-menu__trigger-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  font-size: 0.95rem;
}

.app-context-menu__dots {
  display: block;
  transform: translateY(-0.05em);
}

.app-context-menu__panel {
  z-index: 900;
  min-width: 10.5rem;
  padding: 0.3rem 0;
  margin: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow:
    0 10px 25px -8px rgba(15, 23, 42, 0.18),
    var(--shadow-card, 0 1px 2px rgba(15, 23, 42, 0.06));
}

.app-context-menu__item {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 0.55rem 0.85rem;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background var(--ease-out);
}

.app-context-menu__item:hover:not(:disabled) {
  background: var(--surface-muted, #f3f4f6);
}

.app-context-menu__item:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent);
  outline-offset: -2px;
}

.app-context-menu__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-context-menu__item--danger {
  color: #b91c1c;
}

.app-context-menu__item--danger:hover:not(:disabled) {
  background: #fef2f2;
}
</style>
