import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomePage.vue') },
    { path: '/login', name: 'login', component: () => import('@/views/LoginPage.vue') },
    { path: '/history', name: 'history', component: () => import('@/views/HistoryPage.vue') },
    {
      path: '/admin/teams',
      name: 'admin-teams',
      meta: { requiresAdmin: true },
      component: () => import('@/views/TeamsPage.vue'),
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      meta: { requiresAdmin: true },
      component: () => import('@/views/UsersPage.vue'),
    },
    {
      path: '/admin/vacations',
      name: 'admin-vacations',
      meta: { requiresAdmin: true },
      component: () => import('@/views/VacationsPage.vue'),
    },
    {
      path: '/holidays',
      name: 'holidays',
      component: () => import('@/views/NonWorkingDaysPage.vue'),
    },
    {
      path: '/admin/queue',
      name: 'admin-queue',
      meta: { requiresAdmin: true },
      component: () => import('@/views/QueueOrderPage.vue'),
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' };
  }
  return true;
});

export default router;
