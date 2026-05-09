<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/UI/AppButton.vue';
import AppModal from '@/components/UI/AppModal.vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{
  modelValue: boolean;
  /** Подсказка под заголовком (например, при переходе в админку без сессии) */
  hint?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();

const login = ref('');
const password = ref('');
const passwordVisible = ref(false);
const error = ref<string | null>(null);
const loading = ref(false);

const ariaDescribedBy = computed(() => {
  const ids: string[] = [];
  if (props.hint) ids.push('login-modal-hint');
  if (error.value) ids.push('login-modal-error');
  return ids.length ? ids.join(' ') : undefined;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = null;
    }
  },
);

async function onSubmit(): Promise<void> {
  error.value = null;
  loading.value = true;
  try {
    await auth.login(login.value.trim(), password.value);
    const target = ui.redirectAfterLogin;
    emit('update:modelValue', false);
    login.value = '';
    password.value = '';
    passwordVisible.value = false;
    if (target) {
      await router.replace(target);
    }
  } catch {
    error.value = 'Неверный логин или пароль';
  } finally {
    loading.value = false;
  }
}

function onClose(): void {
  error.value = null;
  login.value = '';
  password.value = '';
  passwordVisible.value = false;
}
</script>

<template>
  <AppModal
    :model-value="modelValue"
    title="Вход администратора"
    size="sm"
    @update:model-value="emit('update:modelValue', $event)"
    @close="onClose"
  >
    <form
      class="login-form"
      :aria-describedby="ariaDescribedBy"
      @submit.prevent="onSubmit"
    >
      <p v-if="hint" id="login-modal-hint" class="login-form__hint muted">
        {{ hint }}
      </p>
      <label class="muted" for="login-modal-lg">Логин</label>
      <input
        id="login-modal-lg"
        v-model="login"
        class="input"
        type="text"
        autocomplete="username"
        placeholder="Введите логин"
        required
      />

      <label class="muted" for="login-modal-pw">Пароль</label>
      <div class="login-form__pw-wrap">
        <input
          id="login-modal-pw"
          v-model="password"
          class="input login-form__pw-input"
          :type="passwordVisible ? 'text' : 'password'"
          autocomplete="current-password"
          placeholder="Введите пароль"
          required
        />
        <button
          type="button"
          class="login-form__pw-toggle"
          :aria-pressed="passwordVisible"
          :aria-label="passwordVisible ? 'Скрыть пароль' : 'Показать пароль'"
          @click="passwordVisible = !passwordVisible"
        >
          <span class="login-form__pw-toggle-icon" aria-hidden="true">
            <!-- глаз: пароль скрыт -->
            <svg
              v-if="!passwordVisible"
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <!-- перечёркнутый глаз: пароль виден -->
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </span>
        </button>
      </div>

      <p
        v-if="error"
        id="login-modal-error"
        class="error"
        role="alert"
        aria-live="polite"
      >
        {{ error }}
      </p>

      <AppButton
        class="login-form__submit"
        variant="primary"
        type="submit"
        :disabled="loading"
      >
        {{ loading ? 'Вход…' : 'Войти' }}
      </AppButton>
    </form>
  </AppModal>
</template>

<style scoped lang="scss">
.login-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.login-form__hint {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
  line-height: 1.4;
}

.login-form__pw-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
}

.login-form__pw-input {
  flex: 1;
  min-width: 0;
  padding-right: 2.75rem;
}

.login-form__pw-toggle {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color var(--ease-out),
    background var(--ease-out);
}

.login-form__pw-toggle:hover {
  color: var(--text);
  background: rgba(15, 23, 42, 0.06);
}

.login-form__pw-toggle:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent);
  outline-offset: var(--focus-ring-offset);
}

.login-form__pw-toggle-icon {
  display: flex;
  line-height: 0;
}

.login-form__submit {
  margin-top: 0.25rem;
}
</style>
