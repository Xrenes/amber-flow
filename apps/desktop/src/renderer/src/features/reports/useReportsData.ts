import { useCallback, useEffect, useState } from 'react';
import {
  getSupabase,
  listAllAppointmentsForReports,
  subscribeToAllAppointments,
  type Appointment,
} from '@amber-flow/shared';
import { isDemoMode, demoAppointments } from '../../demo/demoData';

// Reports data: EVERY agent's appointments (not just the signed-in login's),
// each attributed by agent_name. Needs migration 028 (appt_select_all) for
// agents; until that's run, RLS quietly returns only the agent's own rows
// (admins/managers already see all).
export function useReportsAppointments(enabled: boolean) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setAppointments(demoAppointments);
      setLoading(false);
      return;
    }
    const { data } = await listAllAppointmentsForReports();
    if (data) setAppointments(data as Appointment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    if (isDemoMode()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = subscribeToAllAppointments(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      getSupabase().removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { appointments, loading, refresh };
}
