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
