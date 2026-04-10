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
  email?: string;
  teamId: string;
  isActive: boolean;
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

export type CurrentPresenterResult =
  | { kind: 'non_working' }
  | { kind: 'no_queue' }
  | { kind: 'no_available' }
  | { kind: 'ok'; userId: string; user: { _id: string; fullName: string; email?: string } };

export interface UpcomingRow {
  moscowDate: string;
  presenter: { _id: string; fullName: string } | null;
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
