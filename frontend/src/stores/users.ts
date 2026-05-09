import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { User } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchUsers(teamId?: string, includeInactive = false): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<User[]>('/users', {
        params: { teamId, includeInactive },
      });
      users.value = data;
    } catch (e) {
      error.value = getApiErrorMessage(e, 'Не удалось загрузить участников');
      notifyError(e, 'Не удалось загрузить участников');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createUser(payload: {
    fullName: string;
    teamId: string;
    isActive?: boolean;
    onMaternityLeave?: boolean;
    birthday?: string | null;
  }): Promise<User> {
    try {
      const { data } = await api.post<User>('/users', payload);
      notifySuccess('Участник успешно добавлен');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось создать участника');
      throw e;
    }
  }

  async function updateUser(
    id: string,
    payload: Partial<{
      fullName: string;
      teamId: string;
      isActive: boolean;
      onMaternityLeave: boolean;
      birthday: string | null;
    }>,
  ): Promise<User> {
    try {
      const { data } = await api.put<User>(`/users/${id}`, payload);
      notifySuccess('Данные участника обновлены');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось обновить участника');
      throw e;
    }
  }

  async function deleteUser(id: string): Promise<User> {
    try {
      const { data } = await api.delete<User>(`/users/${id}`);
      notifySuccess('Участник деактивирован');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось деактивировать участника');
      throw e;
    }
  }

  return { users, loading, error, fetchUsers, createUser, updateUser, deleteUser };
});
