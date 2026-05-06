import axios from 'axios';
import { getActivePinia } from 'pinia';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lk_daily_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err: unknown) => {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 401) {
      localStorage.removeItem('lk_daily_token');
      const { useAuthStore } = await import('@/stores/auth');
      const pinia = getActivePinia();
      if (pinia) {
        useAuthStore(pinia).logout();
      }
    }
    return Promise.reject(err);
  },
);
