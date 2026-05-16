<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { RouterLink, useRouter } from 'vue-router';

import LoginModal from '@/components/LoginModal.vue';
import AppButton from '@/components/UI/AppButton.vue';
import { RouteName } from '@/constants/routerName';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

interface AppSidebarProps {
	mobileOpen?: boolean;
}

defineProps<AppSidebarProps>();

const emit = defineEmits<{
  navigate: [];
}>();

const auth = useAuthStore();
const router = useRouter();
const ui = useUiStore();
const { adminLoginModalOpen, adminLoginHint } = storeToRefs(ui);

const logout = (): void => {
  auth.logout();
  void router.push({ name: RouteName.Home });
  emit('navigate');
}
</script>

<template>
  <aside
    id="app-sidebar"
    class="sidebar"
    :class="{ 'sidebar--mobile-open': mobileOpen }"
    aria-label="Навигация и настройки"
  >
    <div class="sidebar__head">
      <RouterLink class="sidebar__brand" to="/" @click="emit('navigate')"
        >LK Daily</RouterLink
      >
      <button
        type="button"
        class="sidebar__close"
        aria-label="Закрыть меню"
        @click="emit('navigate')"
      >
        ×
      </button>
    </div>

    <p class="sidebar__summary">
      Быстрый доступ к ключевым сценариям, журналу и административным разделам.
    </p>

    <div v-if="auth.verifyError" class="sidebar__verify-error" role="alert">
      {{ auth.verifyError }}
    </div>

    <nav class="sidebar__nav">
      <RouterLink class="sidebar__link" to="/" @click="emit('navigate')"
        >Сегодня</RouterLink
      >
      <RouterLink
        class="sidebar__link"
        to="/today-holiday"
        @click="emit('navigate')"
      >
        Какой сегодня праздник?
      </RouterLink>
      <RouterLink class="sidebar__link" to="/holidays" @click="emit('navigate')"
        >Нерабочие дни</RouterLink
      >
      <RouterLink
        class="sidebar__link"
        to="/vacation-schedule"
        @click="emit('navigate')"
      >
        График отпусков
      </RouterLink>
      <RouterLink class="sidebar__link" to="/history" @click="emit('navigate')"
        >История</RouterLink
      >

      <template v-if="auth.isAdmin">
        <p class="sidebar__section">Администрирование</p>
        <RouterLink
          v-if="auth.isSuperAdmin"
          class="sidebar__link"
          to="/admin/teams"
          @click="emit('navigate')"
        >
          Управление командами
        </RouterLink>
        <RouterLink
          class="sidebar__link"
          to="/admin/users"
          @click="emit('navigate')"
          >Участники</RouterLink
        >
        <RouterLink
          class="sidebar__link"
          to="/admin/queue"
          @click="emit('navigate')"
          >Настройка очереди</RouterLink
        >
        <RouterLink
          class="sidebar__link"
          to="/admin/stats"
          @click="emit('navigate')"
          >Статистика</RouterLink
        >
      </template>
    </nav>

    <div class="sidebar__footer">
      <template v-if="auth.isAdmin">
        <span class="sidebar__user">{{ auth.loginName ?? 'admin' }}</span>
        <AppButton type="button" class="sidebar__logout" @click="logout">Выйти</AppButton>
      </template>
      <template v-else>
        <AppButton
          type="button"
          class="sidebar__login"
          variant="primary"
          @click="ui.openLoginModal()"
        >
          Вход
        </AppButton>
      </template>
    </div>

    <LoginModal
      :model-value="adminLoginModalOpen"
      :hint="adminLoginHint"
      @update:model-value="ui.setLoginModalOpen"
    />
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: var(--sidebar-width);
  min-height: 0;
  align-self: flex-start;
  position: sticky;
  top: var(--topbar-height);
  height: calc(100dvh - var(--topbar-height));
  max-height: calc(100dvh - var(--topbar-height));
  overflow: hidden;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  padding: var(--space-4) var(--space-3);
  box-sizing: border-box;
}

.sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.sidebar__brand {
  font-weight: 800;
  font-size: 1.15rem;
  color: var(--sidebar-text);
  text-decoration: none;
  border-radius: var(--radius-sm);
  padding: 0.15rem 0.25rem;
  align-self: flex-start;
}

.sidebar__brand:hover {
  text-decoration: none;
  color: var(--accent-muted);
}

.sidebar__close {
  display: none;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--sidebar-text);
  font-size: 1.35rem;
}

.sidebar__summary {
  margin-bottom: var(--space-3);
  color: var(--sidebar-muted);
  font-size: 0.9rem;
}

.sidebar__verify-error {
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: var(--radius-sm);
  color: #fecaca;
  font-size: 0.8rem;
  line-height: 1.4;
  padding: var(--space-2);
  margin-bottom: var(--space-3);
  background: rgba(127, 29, 29, 0.35);
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sidebar__section {
  margin: var(--space-3) 0 var(--space-1);
  padding: 0 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sidebar-muted);
}

.sidebar__link {
  display: block;
  color: var(--sidebar-text);
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-md);
  text-decoration: none;
  border: 1px solid transparent;
  font-size: 0.95rem;
  line-height: 1.35;
  transition:
    color var(--ease-out),
    background var(--ease-out),
    border-color var(--ease-out);
}

.sidebar__link:hover {
  color: var(--sidebar-text);
  text-decoration: none;
  background: var(--sidebar-hover);
}

.sidebar__link.router-link-active {
  color: var(--sidebar-text);
  background: linear-gradient(
    180deg,
    rgba(13, 148, 136, 0.2),
    rgba(20, 184, 166, 0.12)
  );
  border-color: rgba(45, 212, 191, 0.55);
  box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.18);
}

.sidebar__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--accent-muted);
  outline-offset: var(--focus-ring-offset);
}

.sidebar__footer {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: var(--space-3);
  border-top: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sidebar__user {
  font-size: 0.9rem;
  word-break: break-word;
  color: var(--sidebar-muted);
}

.sidebar__logout,
.sidebar__login {
  width: 100%;
  justify-content: center;
}

.sidebar .sidebar__logout {
  background: var(--sidebar-hover);
  border-color: var(--sidebar-border);
  color: var(--sidebar-text);
}

.sidebar .sidebar__logout:hover:not(:disabled) {
  background: #2d3139;
  border-color: #3d4450;
}

.sidebar .sidebar__logout:active:not(:disabled) {
  background: #1f2329;
}

@media (max-width: 960px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 30;
    width: min(88vw, 22rem);
    height: 100dvh;
    max-height: 100dvh;
    transform: translateX(-104%);
    transition: transform var(--ease-out);
    border-right: 1px solid var(--sidebar-border);
  }

  .sidebar--mobile-open {
    transform: translateX(0);
  }

  .sidebar__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar__footer {
    flex-direction: column;
  }
}
</style>
