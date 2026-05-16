export const USER_GENDERS = ['male', 'female'] as const;

export type UserGender = (typeof USER_GENDERS)[number];

const GENDER_LABELS: Record<UserGender, string> = {
  male: 'Мужской',
  female: 'Женский',
};

export function genderLabel(gender: UserGender | null | undefined): string {
  if (!gender) return '—';
  return GENDER_LABELS[gender] ?? gender;
}

export const GENDER_OPTIONS: { value: UserGender; label: string }[] =
  USER_GENDERS.map((value) => ({
    value,
    label: GENDER_LABELS[value],
  }));
