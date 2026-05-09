import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { Team } from '@/types/api';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyError, notifySuccess } from '@/composables/useAppNotifications';

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
      error.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
      notifyError(e, 'Не удалось загрузить команды');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createTeam(payload: { name: string; description?: string; region?: string }): Promise<Team> {
    try {
      const { data } = await api.post<Team>('/teams', payload);
      await fetchTeams();
      notifySuccess('Команда успешно создана');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось сохранить команду');
      throw e;
    }
  }

  async function updateTeam(
    id: string,
    payload: { name?: string; description?: string; region?: string },
  ): Promise<Team> {
    try {
      const { data } = await api.put<Team>(`/teams/${id}`, payload);
      await fetchTeams();
      notifySuccess('Команда успешно обновлена');
      return data;
    } catch (e) {
      notifyError(e, 'Не удалось сохранить команду');
      throw e;
    }
  }

  async function deleteTeam(id: string): Promise<void> {
    try {
      await api.delete(`/teams/${id}`);
      await fetchTeams();
      notifySuccess('Команда успешно удалена');
    } catch (e) {
      notifyError(e, 'Не удалось удалить команду');
      throw e;
    }
  }

  return { teams, loading, error, fetchTeams, createTeam, updateTeam, deleteTeam };
});
