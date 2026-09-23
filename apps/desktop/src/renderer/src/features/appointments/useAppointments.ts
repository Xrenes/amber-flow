import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listAppointmentsByUser,
  subscribeToAppointments,
  upsertAppointments,
  completeAppointment,
  missAppointment,
  deleteAppointment,
  getSupabase,
  type Appointment,
} from '@amber-flow/shared';
import { isDemoMode, demoAppointments } from '../../demo/demoData';

// Ports app.js's appointments state: loadAppointments/saveAppointments (via
// Supabase instead of localStorage), the rt-appts-<uid> realtime subscription,
// and _checkApptTimers (auto-mark overdue pending appointments as missed).
// Reminder *firing* (the alarm) is left to the caller (MainPage's scheduler);
// this hook only tracks reminderSent-equivalent state implicitly via status.

const CHECK_INTERVAL_MS = 30_000;

export interface UseAppointmentsResult {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  createAppointment: (input: NewAppointmentInput) => Promise<void>;
  updateAppointment: (id: string, input: NewAppointmentInput) => Promise<void>;
  completeAppt: (id: string) => Promise<void>;
  missAppt: (id: string) => Promise<void>;
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
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `appt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    if (isDemoMode()) {
      setAppointments(demoAppointments);
      setLoading(false);
      return;
    }
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
        created_at: now,
      };
      // Optimistic local update, then sync (app.js's saveAppointments -> _syncApptsToDB).
      setAppointments((prev) => [row, ...prev]);
      if (!isDemoMode()) await upsertAppointments([row]);
    },
    [userId]
  );

  const updateAppointment = useCallback(
    async (id: string, input: NewAppointmentInput) => {
      if (!userId) return;
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                project_name: input.projectName,
                title: input.title,
                description: input.description || '',
                scheduled_time: input.scheduledTime,
                timezone: input.timezone,
                reminder_minutes: input.reminderMinutes,
              }
            : a
        )
      );
      if (isDemoMode()) return;
      const existing = appointmentsRef.current.find((a) => a.id === id);
      await upsertAppointments([
        {
          id,
          user_id: userId,
          project_name: input.projectName,
          title: input.title,
          description: input.description || '',
          scheduled_time: input.scheduledTime,
          timezone: input.timezone,
          reminder_minutes: input.reminderMinutes,
          status: existing?.status || 'pending',
        },
      ]);
    },
    [userId]
  );

  const completeApptFn = useCallback(
    async (id: string) => {
      if (!userId) return;
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'completed' } : a)));
      if (!isDemoMode()) await completeAppointment(id, userId);
    },
    [userId]
  );

  const missApptFn = useCallback(
    async (id: string) => {
      if (!userId) return;
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'missed' } : a)));
      if (!isDemoMode()) await missAppointment(id, userId);
    },
    [userId]
  );

  const deleteApptFn = useCallback(
    async (id: string) => {
      if (!userId) return;
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      if (!isDemoMode()) await deleteAppointment(id, userId);
    },
    [userId]
  );

  // Ports _checkApptTimers: auto-mark overdue pending appointments as missed,
  // polled every 30s. Reminder firing (within reminderMinutes of due) is left
  // to the caller's scheduler (MainPage), which owns alarm orchestration.
  useEffect(() => {
    if (!userId || isDemoMode()) return;
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
    deleteAppt: deleteApptFn,
    refresh,
  };
}
