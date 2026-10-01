import { useEffect, useState } from 'react';
import { listAppointmentsByUser, type Appointment } from '@amber-flow/shared';

const REFRESH_INTERVAL_MS = 30_000;

// Read-only, poll-based appointments list for Home's "Pending Appointments"
// preview. Deliberately NOT the full useAppointments hook: that hook opens
// its own realtime subscription to 'rt-appts-<uid>', and the Appointments
// tab's useAppointments already holds that exact channel open (every tab
// stays mounted, per MainTabs) — a second subscribe() on the same channel
// throws ("cannot add postgres_changes callbacks ... after subscribe()").
// A 30s poll avoids that and is plenty fresh for a home-screen preview.
export function usePendingAppointments(userId: string | undefined) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    function refresh() {
      listAppointmentsByUser(userId!).then(({ data }) => {
        if (cancelled) return;
        if (data) setAppointments(data as Appointment[]);
        setLoading(false);
      });
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  return { appointments, loading };
}
