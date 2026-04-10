import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { Team } from '@/types/api';

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<Team[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchTeams(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<Team[]>('/teams');
      teams.value = data;
    } catch (e) {
      error.value = 'Не удалось загрузить команды';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createTeam(payload: { name: string; description?: string; region?: string }): Promise<Team> {
    const { data } = await api.post<Team>('/teams', payload);
    await fetchTeams();
    return data;
  }

  async function updateTeam(
    id: string,
    payload: { name?: string; description?: string; region?: string },
  ): Promise<Team> {
    const { data } = await api.put<Team>(`/teams/${id}`, payload);
    await fetchTeams();
    return data;
  }

  async function deleteTeam(id: string): Promise<void> {
    await api.delete(`/teams/${id}`);
    await fetchTeams();
  }

  return { teams, loading, error, fetchTeams, createTeam, updateTeam, deleteTeam };
});
