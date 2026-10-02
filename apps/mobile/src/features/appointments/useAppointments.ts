import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listAppointmentsByUser,
  subscribeToAppointments,
  upsertAppointments,
  updateAppointmentFields,
  completeAppointment,
  missAppointment,
  deleteAppointment,
  insertActivityLog,
  appointmentLogMetadata,
  getSupabase,
  type Appointment,
  type ShowStatus,
} from '@amber-flow/shared';

// Mobile port of the desktop useAppointments hook: local-first optimistic
// updates synced to Supabase in the background, merged with realtime
// changes, plus the auto-mark-missed poller for overdue pending appointments.

const CHECK_INTERVAL_MS = 30_000;

export interface UseAppointmentsResult {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  createAppointment: (input: NewAppointmentInput) => Promise<void>;
  updateAppointment: (id: string, input: NewAppointmentInput) => Promise<void>;
  completeAppt: (id: string, showStatus?: ShowStatus) => Promise<void>;
  missAppt: (id: string) => Promise<void>;
  revertAppt: (id: string) => Promise<void>;
  deleteAppt: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface NewAppointmentInput {
  projectName: string;
  title: string;
  description: string;
  scheduledTime: string; // UTC ISO
  timezone: string;
  reminderMinutes: number;
  accountName: string;
  // Who this appointment is FOR, from the admin-managed Agent list (Field
  // Options). The row is always saved under whoever is signed in.
  agentName: string | null;
}

// appointments.id is a uuid column, so the fallback (Hermes has no
// crypto.randomUUID) must still be a valid v4 UUID or the insert is rejected.
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useAppointments(userId: string | undefined): UseAppointmentsResult {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);
  appointmentsRef.current = appointments;

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error: err } = await listAppointmentsByUser(userId);
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setAppointments((data as Appointment[]) || []);
    }
    setLoading(false);
  }, [userId]);

  // Initial load + realtime subscription (mirrors app.js's rt-appts-<uid> channel).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: err } = await listAppointmentsByUser(userId);
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        setError(null);
        setAppointments((data as Appointment[]) || []);
      }
      setLoading(false);
    })();

    const channel = subscribeToAppointments(userId, (payload) => {
      setAppointments((prev) => {
        if (payload.eventType === 'DELETE') {
          const oldId = payload.old?.id;
          return prev.filter((a) => a.id !== oldId);
        }
        const row = payload.new as Appointment | null;
        if (!row) return prev;
        const idx = prev.findIndex((a) => a.id === row.id);
        if (idx === -1) return [row, ...prev];
        const next = prev.slice();
        next[idx] = row;
        return next;
      });
    });

    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, [userId]);

  const createAppointment = useCallback(
    async (input: NewAppointmentInput) => {
      if (!userId) return;
      const now = new Date().toISOString();
      const row: Appointment = {
        id: genId(),
        user_id: userId,
        project_name: input.projectName,
        title: input.title,
        description: input.description || '',
        scheduled_time: input.scheduledTime,
        reminder_minutes: input.reminderMinutes,
        status: 'pending',
        timezone: input.timezone,
        show_status: null,
        account_name: input.accountName || null,
        agent_name: input.agentName || null,
        created_at: now,
      };
      // Optimistic local update, then sync; rolled back with a visible error
      // if the database rejects it.
      setAppointments((prev) => [row, ...prev]);
      const { error: err } = await upsertAppointments([row]);
      if (err) {
        setAppointments((prev) => prev.filter((a) => a.id !== row.id));
        setError(`Couldn't save appointment: ${err.message}`);
        return;
      }
      setError(null);
      insertActivityLog(userId, 'CREATE_APPOINTMENT', appointmentLogMetadata(row)).catch(() => {});
    },
    [userId]
  );

  const updateAppointment = useCallback(
    async (id: string, input: NewAppointmentInput) => {
      if (!userId) return;
      const existing = appointmentsRef.current.find((a) => a.id === id);
      const fields = {
        project_name: input.projectName,
        title: input.title,
        description: input.description || '',
        scheduled_time: input.scheduledTime,
        timezone: input.timezone,
        reminder_minutes: input.reminderMinutes,
        account_name: input.accountName || null,
        agent_name: input.agentName || null,
      };
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...fields } : a)));
      const { error: err } = await updateAppointmentFields(id, fields);
      if (err) {
        setError(`Couldn't update appointment: ${err.message}`);
        await refresh();
        return;
      }
      setError(null);
      insertActivityLog(userId, 'UPDATE_APPOINTMENT', appointmentLogMetadata({ ...existing, id, ...fields })).catch(
        () => {}
      );
    },
    [userId, refresh]
  );

  const completeApptFn = useCallback(
    async (id: string, showStatus?: ShowStatus) => {
      if (!userId) return;
      const existing = appointmentsRef.current.find((a) => a.id === id);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'completed', show_status: showStatus ?? a.show_status } : a))
      );
      const { error: err } = await completeAppointment(id, userId, showStatus);
      if (err) {
        setError(`Couldn't complete appointment: ${err.message}`);
        await refresh();
        return;
      }
      setError(null);
      insertActivityLog(
          userId,
          'COMPLETE_APPOINTMENT',
          appointmentLogMetadata({
            ...existing,
            id,
            status: 'completed',
            show_status: showStatus ?? existing?.show_status,
          })
        ).catch(() => {});
    },
    [userId, refresh]
  );

  const missApptFn = useCallback(
    async (id: string) => {
      if (!userId) return;
      const existing = appointmentsRef.current.find((a) => a.id === id);
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'missed' } : a)));
      const { error: err } = await missAppointment(id, userId);
      if (err) {
        setError(`Couldn't mark appointment missed: ${err.message}`);
        await refresh();
        return;
      }
      setError(null);
      const missed = appointmentLogMetadata({ ...existing, id, status: 'missed' });
      insertActivityLog(userId, 'MISS_APPOINTMENT', missed).catch(() => {});
    },
    [userId, refresh]
  );

  const revertApptFn = useCallback(
    async (id: string) => {
      if (!userId) return;
      const existing = appointmentsRef.current.find((a) => a.id === id);
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'pending' } : a)));
      const { error: err } = await updateAppointmentFields(id, { status: 'pending' });
      if (err) {
        setError(`Couldn't revert appointment: ${err.message}`);
        await refresh();
        return;
      }
      setError(null);
      insertActivityLog(userId, 'UPDATE_APPOINTMENT', appointmentLogMetadata({ ...existing, id, status: 'pending' })).catch(() => {});
    },
    [userId, refresh]
  );

  const deleteApptFn = useCallback(
    async (id: string) => {
      if (!userId) return;
      const existing = appointmentsRef.current.find((a) => a.id === id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      const { error: err } = await deleteAppointment(id, userId);
      if (err) {
        setError(`Couldn't delete appointment: ${err.message}`);
        await refresh();
        return;
      }
      setError(null);
      insertActivityLog(userId, 'DELETE_APPOINTMENT', appointmentLogMetadata({ ...existing, id })).catch(() => {});
    },
    [userId, refresh]
  );

  // Ports _checkApptTimers: auto-mark overdue pending appointments as missed,
  // polled every 30s. Reminder firing (within reminderMinutes of due) is left
  // to the caller's scheduler (MainPage), which owns alarm orchestration.
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const now = Date.now();
      const overdue = appointmentsRef.current.filter(
        (a) => a.status === 'pending' && new Date(a.scheduled_time).getTime() < now
      );
      if (!overdue.length) return;
      setAppointments((prev) =>
        prev.map((a) => (overdue.some((o) => o.id === a.id) ? { ...a, status: 'missed' } : a))
      );
      await Promise.all(overdue.map((a) => missAppointment(a.id, userId)));
    };
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    check();
    return () => clearInterval(interval);
  }, [userId]);

  return {
    appointments,
    loading,
    error,
    createAppointment,
    updateAppointment,
    completeAppt: completeApptFn,
    missAppt: missApptFn,
    revertAppt: revertApptFn,
    deleteAppt: deleteApptFn,
    refresh,
  };
}
