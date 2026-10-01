import type { ActivityLog } from '@amber-flow/shared';

export interface DayActivity {
  date: string; // YYYY-MM-DD (local)
  idleSeconds: number;
  firstStart: string | null; // first START_TRACKER
  lastStop: string | null; // last STOP_TRACKER
  breaks: number;
  booked: number;
  completed: number;
  missed: number;
  logs: ActivityLog[]; // that day's logs, most-recent-first
}

const IDLE_START_TYPES = new Set(['STATUS_IDLE', 'STATUS_AWAY']);
const IDLE_END_TYPES = new Set(['STATUS_ACTIVE']);

// Local calendar day — slicing the ISO string would give the UTC day, which
// is the wrong date for part of every day outside UTC.
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Groups activity logs by day: tracker start/stop, breaks, appointment
// counts, and idle time from STATUS_IDLE/STATUS_AWAY -> STATUS_ACTIVE pairs
// (walked in chronological order per day). An idle period with no matching
// STATUS_ACTIVE yet is counted up to the last log of that day, not open-ended.
export function groupActivityByDay(logs: ActivityLog[]): DayActivity[] {
  const byDate: Record<string, ActivityLog[]> = {};
  logs.forEach((log) => {
    if (!log.created_at) return;
    const day = localDayKey(log.created_at);
    (byDate[day] = byDate[day] || []).push(log);
  });

  return Object.entries(byDate)
    .map(([date, dayLogs]) => {
      const chrono = [...dayLogs].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      let idleSeconds = 0;
      let idleStart: number | null = null;
      let firstStart: string | null = null;
      let lastStop: string | null = null;
      let breaks = 0;
      let booked = 0;
      let completed = 0;
      let missed = 0;
      for (const log of chrono) {
        const ts = log.created_at ? new Date(log.created_at).getTime() : null;
        if (ts === null) continue;
        switch (log.action_type) {
          case 'START_TRACKER':
            if (!firstStart) firstStart = log.created_at as string;
            break;
          case 'STOP_TRACKER':
            lastStop = log.created_at as string;
            break;
          case 'START_BREAK':
            breaks += 1;
            break;
          case 'CREATE_APPOINTMENT':
          case 'COMPLETE_TASK': // legacy: completing a task booked an appointment
            booked += 1;
            break;
          case 'COMPLETE_APPOINTMENT':
            completed += 1;
            break;
          case 'MISS_APPOINTMENT':
            missed += 1;
            break;
        }
        if (IDLE_START_TYPES.has(log.action_type)) {
          if (idleStart === null) idleStart = ts;
        } else if (IDLE_END_TYPES.has(log.action_type)) {
          if (idleStart !== null) {
            idleSeconds += Math.max(0, (ts - idleStart) / 1000);
            idleStart = null;
          }
        }
      }
      if (idleStart !== null && chrono.length) {
        const lastTs = new Date(chrono[chrono.length - 1].created_at || '').getTime();
        idleSeconds += Math.max(0, (lastTs - idleStart) / 1000);
      }
      return {
        date,
        idleSeconds,
        firstStart,
        lastStop,
        breaks,
        booked,
        completed,
        missed,
        logs: [...dayLogs].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// "HH:MM:SS" digital-clock style, for the idle-time readout.
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
