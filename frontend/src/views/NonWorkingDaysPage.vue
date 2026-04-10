<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useNonWorkingDaysStore } from '@/stores/nonWorkingDays';

const auth = useAuthStore();
const nwd = useNonWorkingDaysStore();

const yearInput = ref(new Date().getFullYear());
const newDate = ref('');
const newDesc = ref('');
const error = ref<string | null>(null);

onMounted(() => {
  void nwd.fetchYear(yearInput.value);
});

async function loadYear(): Promise<void> {
  error.value = null;
  await nwd.fetchYear(yearInput.value);
}

async function addCustom(): Promise<void> {
  error.value = null;
  try {
    await nwd.createCustom(newDate.value, newDesc.value.trim() || undefined);
    newDate.value = '';
    newDesc.value = '';
  } catch {
    error.value = 'Не удалось добавить';
  }
}

async function remove(id: string | null): Promise<void> {
  if (!id) return;
  if (!confirm('Удалить пользовательский выходной?')) return;
  error.value = null;
  try {
    await nwd.removeCustom(id);
  } catch {
    error.value = 'Не удалось удалить';
  }
}

function typeClass(t: string): string {
  if (t === 'federal') return 'badge badge--federal';
  if (t === 'custom') return 'badge badge--custom';
  return 'badge';
}
</script>

<template>
  <h1>Нерабочие дни</h1>
  <p class="muted">
    MVP: федеральные праздники считаются по правилам ТК РФ (код), дополнительно — пользовательские дни из БД.
  </p>

  <div class="card row">
    <label class="muted" for="y">Год</label>
    <input id="y" v-model.number="yearInput" class="input" type="number" min="1970" max="3000" />
    <button type="button" class="btn" @click="loadYear">Показать</button>
  </div>

  <div v-if="auth.isAdmin" class="card">
    <h2>Добавить пользовательский выходной</h2>
    <form class="grid" @submit.prevent="addCustom">
      <label class="muted">Дата</label>
      <input v-model="newDate" class="input" type="date" required />

      <label class="muted">Описание</label>
      <input v-model="newDesc" class="input" />

      <div class="row">
        <button class="btn btn--primary" type="submit">Добавить</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>

  <div class="card">
    <h2>Календарь ({{ nwd.year }})</h2>
    <p v-if="nwd.loading" class="muted">Загрузка…</p>
    <table v-else class="table">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Тип</th>
          <th>Описание</th>
          <th v-if="auth.isAdmin" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in nwd.items" :key="`${it.date}-${it.type}-${idx}`">
          <td>{{ it.date }}</td>
          <td><span :class="typeClass(it.type)">{{ it.type }}</span></td>
          <td>{{ it.description ?? '—' }}</td>
          <td v-if="auth.isAdmin">
            <button
              v-if="it.type === 'custom' && it.id"
              type="button"
              class="btn btn--danger"
              @click="remove(it.id)"
            >
              Удалить
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
h1 {
  margin-top: 0;
}

h2 {
  margin-top: 0;
  font-size: 1.05rem;
}

.grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.5rem 0.75rem;
  align-items: center;
}

.grid .row {
  grid-column: 1 / -1;
}
</style>
