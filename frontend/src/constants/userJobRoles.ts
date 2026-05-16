export const USER_JOB_ROLES = [
  'teamlead',
  'frontend',
  'backend',
  'analyst',
  'qa',
  'pm',
  'design',
] as const;

export type UserJobRole = (typeof USER_JOB_ROLES)[number];

const JOB_ROLE_LABELS: Record<UserJobRole, string> = {
  teamlead: 'Тимлид',
  frontend: 'Фронтенд',
  backend: 'Бэкенд',
  analyst: 'Аналитик',
  qa: 'Тестирование',
  pm: 'PM / Продакт',
  design: 'Дизайнеры',
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
  teamlead: '#89ee08',
  frontend: '#0d9488',
  backend: '#2563eb',
  analyst: '#7c3aed',
  qa: '#ca8a04',
  pm: '#db2777',
  design: '#27dba2',
};
