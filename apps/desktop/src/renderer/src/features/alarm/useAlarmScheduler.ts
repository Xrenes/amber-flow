import { useEffect, useRef } from 'react';
import type { Appointment } from '@amber-flow/shared';
import { useAlarm, type AlarmItem } from './useAlarm';

// Ports app.js's scheduler tick() (lines ~654-688): every second, scan
// pending appointments for items whose reminder or due time has just been
// reached, and fire the alarm for the first one found (app.js shows one
// alarm at a time via the #alarmScreen overlay, queuing implicitly since a
// dismissed alarm re-triggers the tick on the next second).
//
// Tasks were removed from the app entirely — appointments are now the only
// schedulable item, so this is the sole alarm source. An upper bound isn't
// needed here the way it was for the old combined scheduler: pending
// appointments already auto-flip to 'missed' after they're overdue (see
// useAppointments's 30s sweep), so a stale pending appointment can't linger
// and re-alarm indefinitely the way old Task data once did.
const TICK_MS = 1000;

function reminderDateTime(a: Appointment): Date {
  return new Date(new Date(a.scheduled_time).getTime() - (a.reminder_minutes || 0) * 60_000);
}

interface UseAlarmSchedulerArgs {
  appointments: Appointment[];
}

export function useAlarmScheduler({ appointments }: UseAlarmSchedulerArgs) {
  const alarmApi = useAlarm();
  const firedRef = useRef<Set<string>>(new Set());
  const apptsRef = useRef(appointments);
  apptsRef.current = appointments;

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (alarmApi.alarm) return; // one alarm at a time, same as app.js
      const now = Date.now();

      for (const a of apptsRef.current) {
        if (a.status !== 'pending') continue;
        const dueKey = `appt-due-${a.id}`;
        const remKey = `appt-rem-${a.id}`;
        const due = new Date(a.scheduled_time).getTime();
        const rem = reminderDateTime(a).getTime();

        if (!firedRef.current.has(remKey) && a.reminder_minutes > 0 && now >= rem && now < due) {
          firedRef.current.add(remKey);
          const item: AlarmItem = {
            id: a.id,
            title: a.title,
            description: a.description,
            displayTime: new Date(a.scheduled_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
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
            displayTime: new Date(a.scheduled_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
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
