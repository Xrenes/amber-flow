import type { ActivityLog, TimeSession } from '@amber-flow/shared';

// Shared by Admin → Attendance and Overview so both always agree on who is
// working, since when, and for how long.

export interface DayRecord {
  date: string; // YYYY-MM-DD (local)
  firstIn: string; // ISO
  lastOut: string | null; // ISO
  totalSeconds: number;
  sessionCount: number;
  working: boolean; // tracker running right now (today only)
  onBreak: boolean; // on a break right now (today only)
}

export const EXPECTED_START_HOUR = 9; // clock-ins at 10:00 or later are flagged "Late"
export const TARGET_SECONDS = 8 * 3600; // a full day
const LIVE_LOOKBACK_MS = 18 * 3600 * 1000;
// RESUME_TRACKER is logged by the mobile tracker when resuming after Stop.
const TRACKER_EVENTS = new Set(['START_TRACKER', 'RESUME_TRACKER', 'STOP_TRACKER', 'START_BREAK', 'END_BREAK']);

// Local calendar day — toISOString() would give the UTC day, which is the
// wrong date for part of every day outside UTC.
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isLate(rec: DayRecord | undefined): boolean {
  return !!rec && new Date(rec.firstIn).getHours() >= EXPECTED_START_HOUR + 1;
}

// byAgent[userId][YYYY-MM-DD] = that agent's day. Saved sessions give past
// days; today's live state comes from tracker activity logs, because the
// tracker only saves a time_sessions row when a session is STOPPED — a
// session in progress exists only as its START_TRACKER log. The latest
// tracker event decides the state: started/back from break → working,
// break → on break, stopped → clocked out.
export function buildAttendance(
  sessions: TimeSession[],
  logs: ActivityLog[],
  now: number
): Record<string, Record<string, DayRecord>> {
  const map: Record<string, Record<string, DayRecord>> = {};
  sessions.forEach((s) => {
    if (!s.start_time) return;
    const day = dayKey(new Date(s.start_time));
    map[s.user_id] ||= {};
    const rec = map[s.user_id][day];
    if (!rec) {
      map[s.user_id][day] = {
        date: day,
        firstIn: s.start_time,
        lastOut: s.end_time,
        totalSeconds: s.duration_seconds || 0,
        sessionCount: 1,
        working: false,
        onBreak: false,
      };
    } else {
      if (new Date(s.start_time) < new Date(rec.firstIn)) rec.firstIn = s.start_time;
      if (s.end_time && (!rec.lastOut || new Date(s.end_time) > new Date(rec.lastOut))) rec.lastOut = s.end_time;
      rec.totalSeconds += s.duration_seconds || 0;
      rec.sessionCount += 1;
    }
  });

  // Look back 18h (not just since midnight) so a shift that started last
  // night and is still running still shows as working today.
  const recent = logs
    .filter(
      (l) => l.created_at && TRACKER_EVENTS.has(l.action_type) && now - new Date(l.created_at).getTime() < LIVE_LOOKBACK_MS
    )
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const byUser: Record<string, ActivityLog[]> = {};
  recent.forEach((l) => (byUser[l.user_id] ||= []).push(l));

  const today = dayKey(new Date(now));
  Object.entries(byUser).forEach(([userId, events]) => {
    const last = events[events.length - 1];
    const working =
      last.action_type === 'START_TRACKER' || last.action_type === 'RESUME_TRACKER' || last.action_type === 'END_BREAK';
    const onBreak = last.action_type === 'START_BREAK';
    const lastStart = [...events].reverse().find((e) => e.action_type === 'START_TRACKER' || e.action_type === 'RESUME_TRACKER');
    // First start today; if the only start was last night and it's still
    // running, that start counts as today's first in.
    const firstStart =
      events.find((e) => e.action_type === 'START_TRACKER' && dayKey(new Date(e.created_at as string)) === today)
        ?.created_at || (working || onBreak ? lastStart?.created_at : undefined);
    if (!firstStart && !working && !onBreak) return;

    // Time since the running session's start, unless it was already saved.
    let liveSecs = 0;
    if (working && lastStart) {
      const start = new Date(lastStart.created_at as string).getTime();
      const saved = sessions.some((s) => s.user_id === userId && new Date(s.start_time).getTime() >= start - 60_000);
      if (!saved) liveSecs = Math.max(0, Math.round((now - start) / 1000));
    }

    map[userId] ||= {};
    const rec = map[userId][today];
    if (!rec) {
      map[userId][today] = {
        date: today,
        firstIn: firstStart || (last.created_at as string),
        lastOut: last.action_type === 'STOP_TRACKER' ? (last.created_at as string) : null,
        totalSeconds: liveSecs,
        sessionCount: 1,
        working,
        onBreak,
      };
    } else {
      if (firstStart && new Date(firstStart) < new Date(rec.firstIn)) rec.firstIn = firstStart;
      rec.totalSeconds += liveSecs;
      if (liveSecs) rec.sessionCount += 1;
      rec.working = working;
      rec.onBreak = onBreak;
    }
  });
  return map;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
