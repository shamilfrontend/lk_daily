import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const TEAM_KEY = 'lk_daily_team';

export const useAppStore = defineStore('app', () => {
  const selectedTeamId = ref<string | null>(localStorage.getItem(TEAM_KEY));

  watch(selectedTeamId, (value: string | null) => {
    if (value) {
      localStorage.setItem(TEAM_KEY, value);
    } else {
      localStorage.removeItem(TEAM_KEY);
    }
  });

  return { selectedTeamId };
});
