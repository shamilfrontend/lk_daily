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
