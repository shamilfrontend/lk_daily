import axios from 'axios';

/** Частые ответы API на английском → пользовательский русский текст */
const API_MESSAGE_RU: Record<string, string> = {
  'Invalid year': 'Некорректный год',
  'Invalid teamId': 'Некорректный идентификатор команды',
  'Team not found': 'Команда не найдена',
  'Duplicate key': 'Запись с такими данными уже существует',
  'Internal server error': 'Внутренняя ошибка сервера',
  'Already recorded for this team today':
    'За сегодня для этой команды отметка уже сделана',
};

function messageFromResponse(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message?: unknown }).message;
    return typeof m === 'string' && m.length > 0 ? m : undefined;
  }
  return undefined;
}

/** Текст ошибки из ответа Axios либо запасная строка на русском */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const raw = messageFromResponse(error.response?.data);
    if (raw) {
      return API_MESSAGE_RU[raw] ?? raw;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
