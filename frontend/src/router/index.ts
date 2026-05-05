import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      meta: {
        pageTitle: 'Сегодня',
        pageDescription: 'Кто показывает сегодня, как выглядит очередь и что будет в ближайшие рабочие дни.',
      },
      component: () => import('@/views/HomePage.vue'),
    },
    { path: '/login', redirect: '/' },
    {
      path: '/history',
      name: 'history',
      meta: {
        pageTitle: 'История',
        pageDescription: 'Архив выступлений по командам, датам и статусам.',
      },
      component: () => import('@/views/HistoryPage.vue'),
    },
    {
      path: '/admin/teams',
      name: 'admin-teams',
      meta: {
        requiresAdmin: true,
        pageTitle: 'Команды',
        pageDescription: 'Управление командами, описанием и региональными настройками.',
      },
      component: () => import('@/views/TeamsPage.vue'),
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      meta: {
        requiresAdmin: true,
        pageTitle: 'Участники',
        pageDescription: 'Управление составом команд, активностью и статусом декрета.',
      },
      component: () => import('@/views/UsersPage.vue'),
    },
    {
      path: '/admin/vacations',
      name: 'admin-vacations',
      meta: {
        requiresAdmin: true,
        pageTitle: 'Отпуска',
        pageDescription: 'Планирование периодов отсутствия участников с учетом выбранной команды.',
      },
      component: () => import('@/views/VacationsPage.vue'),
    },
    {
      path: '/holidays',
      name: 'holidays',
      meta: {
        pageTitle: 'Нерабочие дни',
        pageDescription: 'Производственный календарь, переносы и региональные даты по выбранной команде.',
      },
      component: () => import('@/views/NonWorkingDaysPage.vue'),
    },
    {
      path: '/admin/queue',
      name: 'admin-queue',
      meta: {
        requiresAdmin: true,
        pageTitle: 'Очередь',
        pageDescription: 'Настройка порядка докладчиков и быстрые действия по управлению списком.',
      },
      component: () => import('@/views/QueueOrderPage.vue'),
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    const ui = useUiStore();
    ui.requestAdminLogin(to.fullPath);
    return { name: 'home', replace: true };
  }
  return true;
});

export default router;
