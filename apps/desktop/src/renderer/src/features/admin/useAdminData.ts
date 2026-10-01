import { useCallback, useEffect, useState } from 'react';
import {
  listAllProfiles,
  listAllAppointments,
  listAllTimeSessions,
  listAllActivityLogs,
  subscribeToAllAppointments,
  subscribeToAllTimeSessions,
  subscribeToAllActivityLogs,
  getSupabase,
} from '@amber-flow/shared';
import type { Profile, Appointment, TimeSession, ActivityLog } from '@amber-flow/shared';
import {
  isDemoMode,
  demoProfiles,
  demoAppointments,
  demoSessions,
  demoActivityLogs,
} from '../../demo/demoData';
import { PROFILES_CHANGED_EVENT } from '../appointments/useTeamDirectory';

export interface AdminData {
  profiles: Profile[];
  appointments: Appointment[];
  sessions: TimeSession[];
  logs: ActivityLog[];
  profileMap: Record<string, Profile>;
}

const EMPTY_DATA: AdminData = {
  profiles: [],
  appointments: [],
  sessions: [],
  logs: [],
  profileMap: {},
};

// Ports admin.js's refreshAdminData() + its four admin-rt-* realtime
// subscriptions with a debounced refetch (_scheduleRtRefresh, 1500ms).
// Fetches are unbounded (capped at 1000/500 rows server-side) rather than
// scoped to a date range — the range picker was removed from every tab
// except Overview, so a hidden stale range would otherwise silently hide
// data on tabs like Appointments/Time Log/Activity with no way to widen it.
export function useAdminData() {
  const [data, setData] = useState<AdminData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);

    if (isDemoMode()) {
      const profileMap: Record<string, Profile> = {};
      demoProfiles.forEach((p) => {
        profileMap[p.id] = p;
      });
      setData({
        profiles: demoProfiles,
        appointments: demoAppointments,
        sessions: demoSessions,
        logs: demoActivityLogs,
        profileMap,
      });
      setLoading(false);
      return;
    }

    const [profRes, apptRes, timeRes, actRes] = await Promise.allSettled([
      listAllProfiles(),
      listAllAppointments(),
      listAllTimeSessions(),
      listAllActivityLogs(),
    ]);

    const profiles = (profRes.status === 'fulfilled' ? profRes.value.data : null) || [];
    const appointments = (apptRes.status === 'fulfilled' ? apptRes.value.data : null) || [];
    const sessions = (timeRes.status === 'fulfilled' ? timeRes.value.data : null) || [];
    const logs = (actRes.status === 'fulfilled' ? actRes.value.data : null) || [];

    const profileMap: Record<string, Profile> = {};
    (profiles as Profile[]).forEach((p) => {
      profileMap[p.id] = p;
    });

    setData({
      profiles: profiles as Profile[],
      appointments: appointments as Appointment[],
      sessions: sessions as TimeSession[],
      logs: logs as ActivityLog[],
      profileMap,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscriptions across all admin-relevant tables, debounced
  // into a single refresh — mirrors admin.js's _scheduleRtRefresh (1500ms).
  useEffect(() => {
    let rtTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (rtTimer) clearTimeout(rtTimer);
      rtTimer = setTimeout(() => {
        refresh();
      }, 1500);
    };

    let connected = 0;
    const onStatus = (status: string) => {
      if (status === 'SUBSCRIBED') {
        connected++;
        if (connected >= 3) setLive(true);
      }
    };

    const channels = [
      subscribeToAllAppointments(scheduleRefresh, onStatus),
      subscribeToAllTimeSessions(scheduleRefresh, onStatus),
      subscribeToAllActivityLogs(scheduleRefresh, onStatus),
    ];

    return () => {
      if (rtTimer) clearTimeout(rtTimer);
      const supabase = getSupabase();
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
    // Subscriptions are set up once; refresh is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A person's display name is their agent name everywhere — reload after a
  // rename in this window, and when the window regains focus (teammates'
  // renames; profiles aren't on the realtime feed).
  useEffect(() => {
    const reload = () => {
      if (!isDemoMode()) refresh();
    };
    window.addEventListener(PROFILES_CHANGED_EVENT, reload);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener(PROFILES_CHANGED_EVENT, reload);
      window.removeEventListener('focus', reload);
    };
  }, [refresh]);

  return { data, loading, live, refresh };
}
