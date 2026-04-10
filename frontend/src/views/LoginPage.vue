<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const login = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

async function onSubmit(): Promise<void> {
  error.value = null;
  loading.value = true;
  try {
    await auth.login(login.value.trim(), password.value);
    await router.push({ name: 'home' });
  } catch {
    error.value = 'Неверный логин или пароль';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="card" style="max-width: 420px">
    <h1>Вход администратора</h1>
    <form class="form" @submit.prevent="onSubmit">
      <label class="muted" for="lg">Логин</label>
      <input id="lg" v-model="login" class="input" type="text" autocomplete="username" required />

      <label class="muted" for="pw">Пароль</label>
      <input id="pw" v-model="password" class="input" type="password" autocomplete="current-password" required />

      <p v-if="error" class="error">{{ error }}</p>

      <button class="btn btn--primary" type="submit" :disabled="loading">
        {{ loading ? 'Вход…' : 'Войти' }}
      </button>
    </form>
  </div>
</template>

<style scoped lang="scss">
h1 {
  margin-top: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
