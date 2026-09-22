import { useEffect, useRef } from 'react';
import type { Task, Appointment } from '@amber-flow/shared';
import { useAlarm, type AlarmItem } from './useAlarm';
import { apptFmtDisplay } from '../appointments/tzUtil';

// Ports app.js's scheduler tick() (lines ~654-688): every second, scan tasks
// and appointments for items whose reminder or due time has just been
// reached, and fire the alarm for the first one found (app.js shows one
// alarm at a time via the #alarmScreen overlay, queuing implicitly since a
// dismissed alarm re-triggers the tick on the next second).
const TICK_MS = 1000;

// Same tz-aware resolution as TaskList.tsx's taskDateTime() — duplicated
// here (rather than imported) since that helper isn't exported and tasks
// aren't this hook's module to modify.
function taskDateTime(t: Task): Date {
  const tz = t.timezone;
  if (tz) {
    try {
      const probe = new Date(`${t.date}T${t.time}:00Z`);
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const p: Record<string, string> = {};
      fmt.formatToParts(probe).forEach(({ type, value }) => {
        p[type] = value;
      });
      const tzLocal = new Date(
        `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`
      );
      const offsetMs = tzLocal.getTime() - probe.getTime();
      return new Date(probe.getTime() - offsetMs);
    } catch {
      /* fall through */
    }
  }
  return new Date(`${t.date}T${t.time}`);
}

function reminderDateTime(t: Task): Date {
  return new Date(taskDateTime(t).getTime() - (t.reminder_minutes || 0) * 60_000);
}

interface UseAlarmSchedulerArgs {
  tasks: Task[];
  appointments: Appointment[];
}

export function useAlarmScheduler({ tasks, appointments }: UseAlarmSchedulerArgs) {
  const alarmApi = useAlarm();
  const firedRef = useRef<Set<string>>(new Set());
  const tasksRef = useRef(tasks);
  const apptsRef = useRef(appointments);
  tasksRef.current = tasks;
  apptsRef.current = appointments;

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (alarmApi.alarm) return; // one alarm at a time, same as app.js
      const now = Date.now();

      for (const t of tasksRef.current) {
        if (t.completed) continue;
        const dueKey = `task-due-${t.id}`;
        const remKey = `task-rem-${t.id}`;
        const due = taskDateTime(t).getTime();
        const rem = reminderDateTime(t).getTime();

        if (!firedRef.current.has(remKey) && t.reminder_minutes > 0 && now >= rem && now < due) {
          firedRef.current.add(remKey);
          const item: AlarmItem = { id: t.id, title: t.title, description: t.description, displayTime: t.time };
          alarmApi.trigger(item, 'task', 'reminder');
          return;
        }
        if (!firedRef.current.has(dueKey) && now >= due) {
          firedRef.current.add(dueKey);
          const item: AlarmItem = { id: t.id, title: t.title, description: t.description, displayTime: t.time };
          alarmApi.trigger(item, 'task', 'due');
          return;
        }
      }

      for (const a of apptsRef.current) {
        if (a.status !== 'pending') continue;
        const dueKey = `appt-due-${a.id}`;
        const remKey = `appt-rem-${a.id}`;
        const due = new Date(a.scheduled_time).getTime();
        const rem = due - (a.reminder_minutes || 0) * 60_000;
        const tz = a.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (!firedRef.current.has(remKey) && a.reminder_minutes > 0 && now >= rem && now < due) {
          firedRef.current.add(remKey);
          const item: AlarmItem = {
            id: a.id,
            title: a.title,
            description: a.description,
            displayTime: apptFmtDisplay(a.scheduled_time, tz),
          };
          alarmApi.trigger(item, 'appointment', 'reminder');
          return;
        }
        if (!firedRef.current.has(dueKey) && now >= due) {
          firedRef.current.add(dueKey);
          const item: AlarmItem = {
            id: a.id,
            title: a.title,
            description: a.description,
            displayTime: apptFmtDisplay(a.scheduled_time, tz),
          };
          alarmApi.trigger(item, 'appointment', 'due');
          return;
        }
      }
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [alarmApi]);

  return alarmApi;
}
