export const USER_GENDERS = ['male', 'female'] as const;

export type UserGender = (typeof USER_GENDERS)[number];
