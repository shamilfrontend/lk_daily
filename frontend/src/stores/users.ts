import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { User } from '@/types/api';

export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([]);
  const loading = ref(false);

  async function fetchUsers(teamId?: string, includeInactive = false): Promise<void> {
    loading.value = true;
    try {
      const { data } = await api.get<User[]>('/users', {
        params: { teamId, includeInactive },
      });
      users.value = data;
    } finally {
      loading.value = false;
    }
  }

  async function createUser(payload: {
    fullName: string;
    email?: string;
    teamId: string;
    isActive?: boolean;
  }): Promise<User> {
    const { data } = await api.post<User>('/users', payload);
    return data;
  }

  async function updateUser(
    id: string,
    payload: Partial<{ fullName: string; email?: string; teamId: string; isActive: boolean }>,
  ): Promise<User> {
    const { data } = await api.put<User>(`/users/${id}`, payload);
    return data;
  }

  async function deleteUser(id: string): Promise<User> {
    const { data } = await api.delete<User>(`/users/${id}`);
    return data;
  }

  return { users, loading, fetchUsers, createUser, updateUser, deleteUser };
});
