import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listAllProfiles,
  listAllAppointments,
  listAllTasks,
  listAllTimeSessions,
  listAllActivityLogs,
  subscribeToAllAppointments,
  subscribeToAllTasks,
  subscribeToAllTimeSessions,
  subscribeToAllActivityLogs,
  getSupabase,
} from '@amber-flow/shared';
import type { Profile, Appointment, Task, TimeSession, ActivityLog } from '@amber-flow/shared';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface AdminData {
  profiles: Profile[];
  appointments: Appointment[];
  tasks: Task[];
  sessions: TimeSession[];
  logs: ActivityLog[];
  profileMap: Record<string, Profile>;
}

const EMPTY_DATA: AdminData = {
  profiles: [],
  appointments: [],
  tasks: [],
  sessions: [],
  logs: [],
  profileMap: {},
};

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function defaultRange(): DateRange {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 6);
  return { from: fmt(from), to: fmt(today) };
}

// Ports admin.js's refreshAdminData() + its four admin-rt-* realtime
// subscriptions with a debounced refetch (_scheduleRtRefresh, 1500ms).
export function useAdminData() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);
  const [data, setData] = useState<AdminData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;

  const refresh = useCallback(async () => {
    setLoading(true);
    const { from, to } = dateRangeRef.current;
    const fromISO = from ? new Date(from).toISOString() : null;
    const toISO = to ? new Date(`${to}T23:59:59`).toISOString() : null;
    const range = { fromISO, toISO };

    const [profRes, apptRes, taskRes, timeRes, actRes] = await Promise.allSettled([
      listAllProfiles(),
      listAllAppointments(range),
      listAllTasks(),
      listAllTimeSessions(range),
      listAllActivityLogs(range),
    ]);

    const profiles = (profRes.status === 'fulfilled' ? profRes.value.data : null) || [];
    const appointments = (apptRes.status === 'fulfilled' ? apptRes.value.data : null) || [];
    const tasks = (taskRes.status === 'fulfilled' ? taskRes.value.data : null) || [];
    const sessions = (timeRes.status === 'fulfilled' ? timeRes.value.data : null) || [];
    const logs = (actRes.status === 'fulfilled' ? actRes.value.data : null) || [];

    const profileMap: Record<string, Profile> = {};
    (profiles as Profile[]).forEach((p) => {
      profileMap[p.id] = p;
    });

    setData({
      profiles: profiles as Profile[],
      appointments: appointments as Appointment[],
      tasks: tasks as Task[],
      sessions: sessions as TimeSession[],
      logs: logs as ActivityLog[],
      profileMap,
    });
    setLoading(false);
  }, []);

  // Refetch whenever the date range changes.
  useEffect(() => {
    refresh();
  }, [refresh, dateRange.from, dateRange.to]);

  // Realtime subscriptions across all 4 admin-relevant tables, debounced
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
        if (connected >= 4) setLive(true);
      }
    };

    const channels = [
      subscribeToAllAppointments(scheduleRefresh, onStatus),
      subscribeToAllTasks(scheduleRefresh, onStatus),
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

  return { data, loading, live, dateRange, setDateRange, refresh };
}
