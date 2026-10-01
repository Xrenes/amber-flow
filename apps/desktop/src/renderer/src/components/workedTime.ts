import type { TimeSession } from '@amber-flow/shared';

// The Time Tracker stores "Campaign — Account" as a single project_name
// label (see useTimeTracker's combineProjectLabel) — split it back apart so
// worked-time reports can break hours down by account.
export function accountFromProjectName(projectName: string | null | undefined): string {
  if (!projectName) return 'Unassigned';
  const parts = projectName.split(' — ');
  return (parts[1] || parts[0] || 'Unassigned').trim() || 'Unassigned';
}

export type WorkedSession = Pick<TimeSession, 'start_time' | 'duration_seconds' | 'project_name'> &
  Partial<Pick<TimeSession, 'end_time'>>;

export interface AccountSlice {
  account: string;
  seconds: number;
  pct: number; // 0-100, share of the day's total
}

export interface DayWorkedTime {
  date: string; // YYYY-MM-DD (local)
  totalSeconds: number;
  slices: AccountSlice[];
  firstIn: string; // ISO
  lastOut: string | null; // ISO
  sessionCount: number;
}

const PALETTE = ['#ff7a18', '#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#2dd4bf', '#fb923c'];

export function colorForAccount(index: number): string {
  return PALETTE[index % PALETTE.length];
}

// Local calendar day — slicing the ISO string would give the UTC day, which
// is the wrong date for part of every day outside UTC.
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Groups sessions by local day, then by account within each day.
export function groupWorkedTimeByDay(sessions: WorkedSession[]): DayWorkedTime[] {
  const byDate: Record<string, { accounts: Record<string, number>; firstIn: string; lastOut: string | null; count: number }> = {};
  sessions.forEach((s) => {
    if (!s.start_time) return;
    const day = localDayKey(new Date(s.start_time));
    const account = accountFromProjectName(s.project_name);
    const sec = s.duration_seconds || 0;
    const d = (byDate[day] ||= { accounts: {}, firstIn: s.start_time, lastOut: s.end_time || null, count: 0 });
    d.accounts[account] = (d.accounts[account] || 0) + sec;
    d.count += 1;
    if (new Date(s.start_time) < new Date(d.firstIn)) d.firstIn = s.start_time;
    if (s.end_time && (!d.lastOut || new Date(s.end_time) > new Date(d.lastOut))) d.lastOut = s.end_time;
  });

  return Object.entries(byDate)
    .map(([date, d]) => {
      const totalSeconds = Object.values(d.accounts).reduce((a, b) => a + b, 0);
      const slices = Object.entries(d.accounts)
        .map(([account, seconds]) => ({
          account,
          seconds,
          pct: totalSeconds ? (seconds / totalSeconds) * 100 : 0,
        }))
        .sort((a, b) => b.seconds - a.seconds);
      return { date, totalSeconds, slices, firstIn: d.firstIn, lastOut: d.lastOut, sessionCount: d.count };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function fmtHM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
