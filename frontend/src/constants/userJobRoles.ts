export const USER_JOB_ROLES = [
  'frontend',
  'backend',
  'analyst',
  'qa',
  'devops',
  'pm',
  'other',
] as const;

export type UserJobRole = (typeof USER_JOB_ROLES)[number];

const JOB_ROLE_LABELS: Record<UserJobRole, string> = {
  frontend: 'Фронтенд',
  backend: 'Бэкенд',
  analyst: 'Аналитик',
  qa: 'Тестирование',
  devops: 'DevOps',
  pm: 'PM / продакт',
  other: 'Другое',
};

export function jobRoleLabel(role: UserJobRole | null | undefined): string {
  if (!role) return 'Роль не указана';
  return JOB_ROLE_LABELS[role] ?? role;
}

/** Порядок сортировки ролей на графике (без роли — в конце). */
export function jobRoleSortIndex(role: UserJobRole | null | undefined): number {
  if (!role) return USER_JOB_ROLES.length;
  const idx = USER_JOB_ROLES.indexOf(role);
  return idx >= 0 ? idx : USER_JOB_ROLES.length - 1;
}

export const JOB_ROLE_OPTIONS: { value: UserJobRole; label: string }[] =
  USER_JOB_ROLES.map((value) => ({
    value,
    label: JOB_ROLE_LABELS[value],
  }));

/** Цвета полос отпусков на графике */
export const JOB_ROLE_COLORS: Record<UserJobRole, string> = {
  frontend: '#0d9488',
  backend: '#2563eb',
  analyst: '#7c3aed',
  qa: '#ca8a04',
  devops: '#ea580c',
  pm: '#db2777',
  other: '#64748b',
};
