import { notify } from '@kyvg/vue3-notification';
import { getApiErrorMessage } from '@/utils/apiError';

interface AppNotifyOptions {
  title?: string;
  duration?: number;
}

const DEFAULT_SUCCESS_TITLE = 'Успех';
const DEFAULT_ERROR_TITLE = 'Ошибка';
const DEFAULT_INFO_TITLE = 'Информация';
const DEFAULT_DURATION = 3500;

function showNotification(
  type: 'success' | 'error' | 'warn',
  text: string,
  options?: AppNotifyOptions,
): void {
  notify({
    type,
    title: options?.title,
    text,
    duration: options?.duration ?? DEFAULT_DURATION,
  });
}

export function notifySuccess(text: string, title = DEFAULT_SUCCESS_TITLE): void {
  showNotification('success', text, { title });
}

export function notifyError(
  error: unknown,
  fallback: string,
  title = DEFAULT_ERROR_TITLE,
): void {
  showNotification('error', getApiErrorMessage(error, fallback), { title, duration: 5000 });
}

export function notifyInfo(text: string, title = DEFAULT_INFO_TITLE): void {
  showNotification('warn', text, { title });
}

export function useAppNotifications() {
  return {
    notifySuccess,
    notifyError,
    notifyInfo,
  };
}
