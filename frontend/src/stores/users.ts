import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { User } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';

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
  }): Promise<User> {
    const { data } = await api.post<User>('/users', payload);
    return data;
  }

  async function updateUser(
    id: string,
    payload: Partial<{
      fullName: string;
      teamId: string;
      isActive: boolean;
      onMaternityLeave: boolean;
    }>,
  ): Promise<User> {
    const { data } = await api.put<User>(`/users/${id}`, payload);
    return data;
  }

  async function deleteUser(id: string): Promise<User> {
    const { data } = await api.delete<User>(`/users/${id}`);
    return data;
  }

  async function importUsers(teamId: string, rows: { fullName: string }[]): Promise<User[]> {
    const { data } = await api.post<{ ok: boolean; users: User[] }>('/users/import', { teamId, rows });
    return data.users;
  }

  return { users, loading, error, fetchUsers, createUser, updateUser, deleteUser, importUsers };
});
