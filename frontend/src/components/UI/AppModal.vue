<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Открыто ли окно (v-model) */
    modelValue: boolean;
    /** Заголовок в шапке (если не задан слот #title) */
    title?: string;
    /** Закрывать по клику на затемнение */
    closeOnBackdrop?: boolean;
    /** Максимальная ширина панели */
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    title: '',
    closeOnBackdrop: true,
    size: 'md',
  },
);

const slots = useSlots();
const hasTitle = computed(() => Boolean(props.title?.trim() || slots.title));
const dialogRef = ref<HTMLElement | null>(null);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const titleId = `app-modal-title-${Math.random().toString(36).slice(2, 9)}`;

function close(): void {
  emit('update:modelValue', false);
  emit('close');
}

function onBackdropPointerDown(e: MouseEvent): void {
  if (!props.closeOnBackdrop) return;
  if (e.target === e.currentTarget) close();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.modelValue) {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'Tab' && props.modelValue) {
    trapFocus(e);
  }
}

let scrollLocked = false;
let previouslyFocused: HTMLElement | null = null;

function getFocusableElements(): HTMLElement[] {
  if (!dialogRef.value) return [];
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true');
}

function focusInitialElement(): void {
  const firstFocusable = getFocusableElements()[0];
  if (firstFocusable) {
    firstFocusable.focus();
    return;
  }
  dialogRef.value?.focus();
}

function restoreFocus(): void {
  previouslyFocused?.focus();
  previouslyFocused = null;
}

function trapFocus(event: KeyboardEvent): void {
  const focusable = getFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || active === dialogRef.value) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

function lockScroll(): void {
  if (scrollLocked) return;
  const prev = document.body.style.overflow;
  document.body.dataset.appModalPrevOverflow = prev;
  document.body.style.overflow = 'hidden';
  scrollLocked = true;
}

function unlockScroll(): void {
  if (!scrollLocked) return;
  const prev = document.body.dataset.appModalPrevOverflow ?? '';
  delete document.body.dataset.appModalPrevOverflow;
  document.body.style.overflow = prev;
  scrollLocked = false;
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      lockScroll();
      document.addEventListener('keydown', onKeydown);
      await nextTick();
      focusInitialElement();
    } else {
      unlockScroll();
      document.removeEventListener('keydown', onKeydown);
      restoreFocus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  unlockScroll();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="app-modal">
      <div
        v-if="modelValue"
        class="app-modal"
        role="presentation"
        @pointerdown.self="onBackdropPointerDown"
      >
        <div
          ref="dialogRef"
          class="app-modal__dialog"
          :class="`app-modal__dialog--${size}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="hasTitle ? titleId : undefined"
          tabindex="-1"
          @pointerdown.stop
        >
          <header class="app-modal__header" :class="{ 'app-modal__header--no-title': !hasTitle }">
            <div v-if="hasTitle" :id="titleId" class="app-modal__title">
              <slot name="title">{{ title }}</slot>
            </div>
            <button
              type="button"
              class="app-modal__close"
              aria-label="Закрыть"
              @click="close"
            >
              ×
            </button>
          </header>
          <div class="app-modal__body">
            <slot />
          </div>
          <footer v-if="slots.footer" class="app-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.app-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
}

.app-modal__dialog {
  display: flex;
  flex-direction: column;
  max-height: min(90dvh, 720px);
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow:
    0 25px 50px -12px rgba(15, 23, 42, 0.25),
    var(--shadow-card);
}

.app-modal__dialog--sm {
  max-width: 22rem;
}

.app-modal__dialog--md {
  max-width: 32rem;
}

.app-modal__dialog--lg {
  max-width: 40rem;
}

.app-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) 0;
  flex-shrink: 0;
}

.app-modal__header--no-title {
  justify-content: flex-end;
  padding-bottom: 0;
}

.app-modal__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.35;
  color: var(--text);
  min-height: 1.35em;
}

.app-modal__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  margin: -0.25rem -0.25rem 0 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  transition: color var(--ease-out), background var(--ease-out);
}

.app-modal__close:hover {
  color: var(--text);
  background: rgba(15, 23, 42, 0.06);
}

.app-modal__close:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent);
  outline-offset: var(--focus-ring-offset);
}

.app-modal__body {
  padding: var(--space-3);
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.app-modal__footer {
  flex-shrink: 0;
  padding: 0 var(--space-3) var(--space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-end;
}

.app-modal-enter-active,
.app-modal-leave-active {
  transition: opacity var(--ease-out);
}

.app-modal-enter-active .app-modal__dialog,
.app-modal-leave-active .app-modal__dialog {
  transition:
    transform var(--ease-out),
    opacity var(--ease-out);
}

.app-modal-enter-from,
.app-modal-leave-to {
  opacity: 0;
}

.app-modal-enter-from .app-modal__dialog,
.app-modal-leave-to .app-modal__dialog {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
