const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,/i;

/** Нормализует avatar из API в src для img. */
export function avatarSrc(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (DATA_URL_RE.test(avatar)) return avatar;
  return `data:image/jpeg;base64,${avatar}`;
}

/** Инициалы из ФИО для placeholder. */
export function avatarInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

const MAX_AVATAR_BYTES = 512 * 1024;

/** Читает файл изображения как data URL с ограничением размера. */
export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Выберите файл изображения'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      reject(new Error('Размер файла не должен превышать 512 КБ'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Не удалось прочитать файл'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}
