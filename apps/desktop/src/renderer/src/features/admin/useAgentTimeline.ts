import { useMemo } from 'react';
import type { ActivityLog, TimeSession } from '@amber-flow/shared';
import { apptWhenLabel } from '../appointments/apptFormat';

// Builds one agent's day into a chronological story: discrete events (from
// activity_logs) interleaved with tracked-work segments (from time_sessions,
// which give the timeline spine its "filled" stretches — the visual
// difference between "working" and "away/on break"). "Login" isn't a real
// tracked event in this app (no sign-in screen log) — the first
// START_TRACKER of the day IS the login moment, per explicit confirmation.

export type TimelineEventKind =
  | 'login'
  | 'logout'
  | 'break_start'
  | 'break_end'
  | 'task_created'
  | 'task_completed'
  | 'appt_created'
  | 'appt_completed'
  | 'appt_missed'
  | 'status';

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  at: string; // ISO
  label: string;
  detail?: string;
}

export interface TimelineSegment {
  start: string; // ISO
  end: string; // ISO
  kind: 'work' | 'gap';
}

export const ACTION_TO_KIND: Record<string, TimelineEventKind | undefined> = {
  RESUME_TRACKER: 'login', // resumed after Stop (mobile) — shown as "Resumed work"
  START_TRACKER: 'login', // overridden below — only the FIRST one of the day is "login", rest are logout->resume
  STOP_TRACKER: 'logout',
  START_BREAK: 'break_start',
  END_BREAK: 'break_end',
  CREATE_TASK: 'task_created',
  COMPLETE_TASK: 'task_completed',
  CREATE_APPOINTMENT: 'appt_created',
  COMPLETE_APPOINTMENT: 'appt_completed',
  MISS_APPOINTMENT: 'appt_missed',
  STATUS_ACTIVE: 'status',
  STATUS_IDLE: 'status',
  STATUS_AWAY: 'status',
};

export function labelFor(log: ActivityLog, isFirstLogin: boolean): { label: string; detail?: string } {
  const meta = (log.metadata || {}) as Record<string, unknown>;
  const project = (meta.project as string) || (meta.projectName as string) || '';
  const title = meta.title as string | undefined;
  const accountName = meta.accountName as string | undefined;
  // The date the appointment is booked FOR (logged since this change) — the
  // log's own created_at is only when it was booked.
  const scheduledTime = meta.scheduledTime as string | undefined;
  const forWhen = scheduledTime ? `for ${apptWhenLabel(scheduledTime, meta.timezone as string | undefined)}` : undefined;
  const apptDetail = [title, accountName, forWhen].filter(Boolean).join(' — ') || undefined;

  switch (log.action_type) {
    case 'START_TRACKER':
      return isFirstLogin
        ? { label: 'Logged in', detail: project ? `Started tracking — ${project}` : 'Started tracking' }
        : { label: 'Resumed work', detail: project || undefined };
    case 'RESUME_TRACKER':
      return { label: 'Resumed work', detail: project || undefined };
    case 'STOP_TRACKER':
      return { label: 'Logged out', detail: project ? `Stopped tracking — ${project}` : 'Stopped tracking' };
    case 'START_BREAK':
      return { label: 'Started a break', detail: project || undefined };
    case 'END_BREAK':
      return { label: 'Ended break', detail: project || undefined };
    case 'CREATE_TASK':
      return { label: 'Task created (legacy)', detail: title };
    case 'COMPLETE_TASK':
      return { label: 'Appointment booked', detail: apptDetail || title };
    case 'CREATE_APPOINTMENT':
      return { label: 'Booked an appointment', detail: apptDetail || project };
    case 'COMPLETE_APPOINTMENT': {
      const showStatus = meta.showStatus as string | undefined;
      const outcome = showStatus === 'showed' ? 'client showed' : showStatus === 'no_show' ? 'no-show' : undefined;
      return {
        label: 'Completed an appointment',
        detail: [title, accountName, forWhen, outcome].filter(Boolean).join(' — ') || undefined,
      };
    }
    case 'MISS_APPOINTMENT':
      return { label: 'Missed an appointment', detail: apptDetail };
    case 'UPDATE_APPOINTMENT':
      return { label: 'Edited an appointment', detail: apptDetail };
    case 'DELETE_APPOINTMENT':
      return { label: 'Deleted an appointment', detail: apptDetail };
    case 'STATUS_ACTIVE':
      return { label: 'Active' };
    case 'STATUS_IDLE':
      return { label: 'Went idle' };
    case 'STATUS_AWAY':
      return { label: 'Went away' };
    default:
      return { label: log.action_type.replace(/_/g, ' ').toLowerCase() };
  }
}

export function dayKeyFor(iso: string): string {
  return iso.slice(0, 10);
}

export function useAgentTimeline(userId: string, dateKey: string, logs: ActivityLog[], sessions: TimeSession[]) {
  return useMemo(() => {
    const dayLogs = logs
      .filter((l) => l.user_id === userId && l.created_at && dayKeyFor(l.created_at) === dateKey)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

    const daySessions = sessions
      .filter((s) => s.user_id === userId && s.start_time && dayKeyFor(s.start_time) === dateKey)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    let seenLogin = false;
    const events: TimelineEvent[] = [];
    dayLogs.forEach((log, idx) => {
      const kind = ACTION_TO_KIND[log.action_type];
      if (!kind) return;
      const isFirstLogin = log.action_type === 'START_TRACKER' && !seenLogin;
      if (isFirstLogin) seenLogin = true;
      const { label, detail } = labelFor(log, isFirstLogin);
      events.push({
        id: log.id || `${log.action_type}-${idx}`,
        kind: isFirstLogin ? 'login' : kind,
        at: log.created_at as string,
        label,
        detail,
      });
    });

    // Segments give the spine its filled ("working") vs. thin ("gap")
    // stretches — one segment per tracked time_sessions row for the day.
    const segments: TimelineSegment[] = daySessions
      .filter((s) => s.end_time)
      .map((s) => ({ start: s.start_time, end: s.end_time as string, kind: 'work' as const }));

    const totalSeconds = daySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

    return { events, segments, totalSeconds, hasActivity: events.length > 0 || segments.length > 0 };
  }, [userId, dateKey, logs, sessions]);
}
