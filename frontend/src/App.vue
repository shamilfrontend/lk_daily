<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppSidebar from '@/components/AppSidebar.vue';
import { useTeamsStore } from '@/stores/teams';
import { useAppStore } from '@/stores/app';

const teams = useTeamsStore();
const app = useAppStore();
const route = useRoute();
const router = useRouter();

const mobileNavOpen = ref(false);

const currentPageTitle = computed(() => {
  return typeof route.meta.pageTitle === 'string' ? route.meta.pageTitle : 'LK Daily';
});

const currentPageDescription = computed(() => {
  return typeof route.meta.pageDescription === 'string' ? route.meta.pageDescription : '';
});

function applyTeamFromQuery(teamId: unknown): void {
  if (typeof teamId !== 'string' || !/^[a-f\d]{24}$/i.test(teamId)) {
    return;
  }
  if (teams.teams.some((t) => t._id === teamId)) {
    app.selectedTeamId = teamId;
  }
}

function onTeamChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  app.selectedTeamId = value || null;
  const nextQuery = { ...route.query };
  if (value) {
    nextQuery.teamId = value;
  } else {
    delete nextQuery.teamId;
  }
  void router.replace({ query: nextQuery });
}

function toggleMobileNav(): void {
  mobileNavOpen.value = !mobileNavOpen.value;
}

onMounted(async () => {
  try {
    await teams.fetchTeams();
    const qTeam = route.query.teamId;
    if (
      typeof qTeam === 'string' &&
      /^[a-f\d]{24}$/i.test(qTeam) &&
      teams.teams.some((t) => t._id === qTeam)
    ) {
      app.selectedTeamId = qTeam;
    } else if (!app.selectedTeamId && teams.teams.length > 0) {
      app.selectedTeamId = teams.teams[0]?._id ?? null;
    }
  } catch {
    /* ignore */
  }
});

watch(
  () => route.query.teamId,
  (q) => {
    applyTeamFromQuery(q);
  },
);

watch(
  () => teams.teams,
  () => {
    applyTeamFromQuery(route.query.teamId);
  },
  { deep: true },
);

watch(
  () => route.fullPath,
  () => {
    mobileNavOpen.value = false;
  },
);
</script>

<template>
  <div class="app-layout app-shell">
    <header class="app-topbar">
      <div class="app-topbar__left">
        <button
          type="button"
          class="app-topbar__menu"
          :aria-expanded="mobileNavOpen"
          aria-controls="app-sidebar"
          @click="toggleMobileNav"
        >
          Меню
        </button>
        <div class="app-topbar__titles">
          <p class="app-topbar__brand">LK Daily</p>
          <div>
            <p class="app-topbar__page">{{ currentPageTitle }}</p>
            <p v-if="currentPageDescription" class="app-topbar__description">
              {{ currentPageDescription }}
            </p>
          </div>
        </div>
      </div>

      <div class="field app-topbar__team">
        <label for="app-team-select">Команда</label>
        <select
          id="app-team-select"
          class="select"
          :value="app.selectedTeamId ?? ''"
          :disabled="teams.loading || teams.teams.length === 0"
          @change="onTeamChange"
        >
          <option value="" disabled>Выберите команду</option>
          <option v-for="team in teams.teams" :key="team._id" :value="team._id">
            {{ team.name }}
          </option>
        </select>
      </div>
    </header>

    <div class="app-layout__body">
      <div v-if="mobileNavOpen" class="app-layout__overlay" @click="mobileNavOpen = false" />
      <AppSidebar :mobile-open="mobileNavOpen" @navigate="mobileNavOpen = false" />
      <main class="app-layout__main">
        <div class="container">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  min-height: 100dvh;
}

.app-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  min-height: var(--topbar-height);
  padding: 0 var(--space-4);
  background: var(--header-bg);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(219, 227, 238, 0.9);
}

.app-topbar__left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.app-topbar__menu {
  display: none;
  min-height: 2.5rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
}

.app-topbar__titles {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.app-topbar__brand,
.app-topbar__page,
.app-topbar__description {
  margin: 0;
}

.app-topbar__brand {
  color: var(--accent-hover);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-topbar__page {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.app-topbar__description {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.app-topbar__team {
  width: min(22rem, 100%);
}

.app-layout__overlay {
  position: fixed;
  inset: var(--topbar-height) 0 0;
  z-index: 29;
  background: rgba(15, 23, 42, 0.45);
}

@media (max-width: 960px) {
  .app-topbar {
    padding: var(--space-2) var(--space-3);
  }

  .app-topbar__menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

@media (max-width: 720px) {
  .app-topbar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .app-topbar__left,
  .app-topbar__titles {
    align-items: flex-start;
  }

  .app-topbar__titles {
    flex-direction: column;
    gap: 0.35rem;
  }

  .app-topbar__team {
    width: 100%;
  }

  .app-layout__overlay {
    inset: 0;
  }
}
</style>
