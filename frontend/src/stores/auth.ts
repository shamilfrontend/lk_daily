import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { api } from '@/api/client';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

interface ResponseVerify {
  ok: boolean;
  login: string;
  role: 'super' | 'team-lead';
  teamIds: string[];
}

const TOKEN_KEY = 'lk_daily_token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const loginName = ref<string | null>(null);
  const role = ref<'super' | 'team-lead' | null>(null);
  const teamIds = ref<string[]>([]);
  const verifyError = ref<string | null>(null);

  const isAdmin = computed(() => Boolean(token.value));
  const isSuperAdmin = computed(() => role.value === 'super');

  function setToken(t: string | null): void {
    token.value = t;
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function login(loginStr: string, password: string): Promise<void> {
    try {
      const { data } = await api.post<{ token: string }>('/auth/login', {
        login: loginStr,
        password,
      });
      setToken(data.token);
      loginName.value = loginStr;
      verifyError.value = null;
      role.value = null;
      teamIds.value = [];
      await verify();
      notifySuccess('Вход выполнен');
    } catch (e) {
      notifyError(e, 'Не удалось выполнить вход');
      throw e;
    }
  }

  function logout(): void {
    setToken(null);
    loginName.value = null;
    role.value = null;
    teamIds.value = [];
  }

  async function verify(): Promise<void> {
    if (!token.value) return;

    try {
      const { data } = await api.get<ResponseVerify>('/auth/verify');

      if (data.ok) {
        loginName.value = data.login;
        role.value = data.role ?? 'super';
        teamIds.value = Array.isArray(data.teamIds) ? data.teamIds : [];
        verifyError.value = null;
      }
    } catch (e) {
      verifyError.value = getApiErrorMessage(e, 'Сессия недействительна');
      notifyError(e, 'Сессия недействительна');
      logout();
    }
  }

  return {
    token,
    loginName,
    role,
    teamIds,
    verifyError,
    isAdmin,
    isSuperAdmin,
    login,
    logout,
    verify,
  };
});
