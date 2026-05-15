export interface Team {
  _id: string;
  name: string;
  description?: string;
  region?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  _id: string;
  fullName: string;
  teamId: string;
  isActive: boolean;
  onMaternityLeave?: boolean;
  onSickLeave?: boolean;
  birthday?: string;
}

export interface Vacation {
  _id: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export type NonWorkingItemType = 'federal' | 'transfer' | 'regional' | 'custom';

export interface NonWorkingItem {
  id: string | null;
  date: string;
  type: NonWorkingItemType;
  description?: string;
  region?: string;
}

export interface HolidayTransferItem {
  id: string;
  fromDate: string;
  toDate: string;
  description?: string;
}

export interface TodayHolidaysResponse {
  items: string[];
  fetchedAt: string;
  sourceUrl: string;
}

export type CurrentPresenterResult =
  | { kind: 'non_working'; reason: string }
  | { kind: 'no_queue' }
  | { kind: 'no_available' }
  | {
      kind: 'ok';
      userId: string;
      user: { _id: string; fullName: string };
      rotationUserId?: string;
      substitution?: { canonicalUserId: string; canonicalFullName: string };
    };

export interface QueueInsightsToday {
  vacationUserIds: string[];
  maternityUserIds: string[];
  sickLeaveUserIds: string[];
}

export interface QueueMember {
  userId: string;
  active: boolean;
}

export type AdminRole = 'super' | 'team-lead';

export interface TeamStatsResponse {
  teamId: string;
  from: string | null;
  to: string | null;
  totals: { presented: number; skipped: number; records: number };
  users: {
    userId: string;
    fullName: string;
    presented: number;
    skipped: number;
    lastMoscowDate: string | null;
  }[];
}

export interface UpcomingRow {
  moscowDate: string;
  presenter: { _id: string; fullName: string } | null;
  substitution?: { canonicalFullName: string };
}

export interface QueueSubstitutionRow {
  id: string;
  moscowDate: string;
  substituteUserId: string;
  substituteFullName: string;
}

export interface HistoryRow {
  _id: string;
  teamId: Team | string;
  date: string;
  userId: User | string | null;
  status: 'presented' | 'skipped' | 'no_available';
  note?: string;
  createdAt: string;
}
