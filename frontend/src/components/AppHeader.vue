<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTeamsStore } from '@/stores/teams';
import { useAppStore } from '@/stores/app';

const auth = useAuthStore();
const teams = useTeamsStore();
const app = useAppStore();
const router = useRouter();

const teamOptions = computed(() => teams.teams);

onMounted(async () => {
  try {
    await teams.fetchTeams();
    if (!app.selectedTeamId && teams.teams.length > 0) {
      app.selectedTeamId = teams.teams[0]?._id ?? null;
    }
  } catch {
    /* ignore */
  }
});

function onTeamChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  app.selectedTeamId = v || null;
}

function logout(): void {
  auth.logout();
  void router.push({ name: 'home' });
}
</script>

<template>
  <header class="header">
    <div class="container header__inner">
      <RouterLink class="brand" to="/">LK Daily</RouterLink>

      <div class="header__controls row">
        <label class="muted" for="team-select">Команда</label>
        <select
          id="team-select"
          class="select"
          :value="app.selectedTeamId ?? ''"
          @change="onTeamChange"
        >
          <option value="" disabled>Выберите команду</option>
          <option v-for="t in teamOptions" :key="t._id" :value="t._id">
            {{ t.name }}
          </option>
        </select>

        <nav class="nav row">
          <RouterLink to="/">Сегодня</RouterLink>
          <RouterLink to="/holidays">Нерабочие дни</RouterLink>
          <RouterLink to="/history">История</RouterLink>
          <template v-if="auth.isAdmin">
            <RouterLink to="/admin/teams">Команды</RouterLink>
            <RouterLink to="/admin/users">Участники</RouterLink>
            <RouterLink to="/admin/vacations">Отпуска</RouterLink>
            <RouterLink to="/admin/queue">Очередь</RouterLink>
          </template>
        </nav>

        <div class="spacer" />

        <template v-if="auth.isAdmin">
          <span class="muted">{{ auth.loginName ?? 'admin' }}</span>
          <button type="button" class="btn" @click="logout">Выйти</button>
        </template>
        <template v-else>
          <RouterLink class="btn btn--primary" to="/login">Вход</RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.header {
  border-bottom: 1px solid var(--border);
  background: #121a26;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header__inner {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

@media (min-width: 900px) {
  .header__inner {
    flex-direction: row;
    align-items: center;
  }
}

.brand {
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
}

.header__controls {
  flex: 1;
}

.nav {
  gap: 0.65rem;
  flex-wrap: wrap;
}

.spacer {
  flex: 1;
}
</style>
