import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSupabase, listAllAppointmentsForReports, subscribeToAllAppointments } from '@amber-flow/shared';
import type { Appointment, TimeSession } from '@amber-flow/shared';
import { useAuth } from '../auth/AuthContext';
import { useAppointments } from '../features/appointments/useAppointments';
import type { TrackerSession } from '../features/tracker/useTimeTracker';
import AppointmentsScreen from './AppointmentsScreen';
import TopBar from '../components/TopBar';
import GoalsReport from '../features/reports/GoalsReport';
import WorkedTimeReport from '../features/reports/WorkedTimeReport';
import ActivityReport from '../features/reports/ActivityReport';
import EvaluationsReport from '../features/reports/EvaluationsReport';
import { TAB_BAR_CLEARANCE } from '../theme/layout';
import { colors } from '../theme/colors';

type Section = 'appointments' | 'goals' | 'workedtime' | 'activity' | 'evaluations';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'appointments', label: 'Appointments', icon: 'calendar' },
  { key: 'goals', label: 'Goals', icon: 'target' },
  { key: 'workedtime', label: 'Worked Time', icon: 'clock' },
  { key: 'activity', label: 'Activity', icon: 'activity' },
  { key: 'evaluations', label: 'Evaluations', icon: 'star' },
];

// Mobile "Reports" tab — the same five sections as desktop's My Reports
// page (Appointments, Goals, Worked Time, Activity, Evaluations), switched
// with a chip row at the top. Appointments keeps booking ("+ New") and its
// own realtime list; the appointments state is created once here and shared
// with Goals so there's a single subscription. Worked Time and Goals reuse
// the tracker's already-live sessions (passed in from MainTabs) rather than
// opening a second time_sessions channel. Activity and Evaluations load
// when opened; pull down to refresh.
export default function ReportsScreen({ trackerSessions }: { trackerSessions: TrackerSession[] }) {
  const { user } = useAuth();
  const appts = useAppointments(user?.id);

  // Everyone's appointments, attributed by agent name (the Appointments
  // section). Needs migration 028 for agents to see teammates' rows;
  // until then RLS quietly returns only their own.
  const [allAppts, setAllAppts] = useState<Appointment[]>([]);
  const reloadAll = useCallback(async () => {
    const { data } = await listAllAppointmentsForReports();
    if (data) setAllAppts(data as Appointment[]);
  }, []);
  useEffect(() => {
    reloadAll();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = subscribeToAllAppointments(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reloadAll, 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      getSupabase().removeChannel(channel);
    };
  }, [reloadAll]);
  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const sharedAppts = useMemo(() => {
    const then =
      <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
      async (...args: A) => {
        await fn(...args);
        await reloadAll();
      };
    return {
      ...appts,
      appointments: allAppts,
      createAppointment: then(appts.createAppointment),
      updateAppointment: then(appts.updateAppointment),
      completeAppt: then(appts.completeAppt),
      missAppt: then(appts.missAppt),
      deleteAppt: then(appts.deleteAppt),
      refresh: reloadAll,
    };
  }, [appts, allAppts, reloadAll]);
  const [section, setSection] = useState<Section>('appointments');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Tracker sessions → the TimeSession shape the shared goal math expects.
  const sessions = useMemo<TimeSession[]>(
    () =>
      trackerSessions.map((s) => ({
        id: s.id,
        user_id: user?.id || '',
        project_name: s.project,
        start_time: new Date(s.start).toISOString(),
        end_time: new Date(s.end).toISOString(),
        duration_seconds: Math.round(s.duration / 1000),
        status: 'completed' as const,
        agent_name: s.agentName ?? null,
      })),
    [trackerSessions, user?.id]
  );

  const switcher = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher}>
      {SECTIONS.map((s) => {
        const active = section === s.key;
        return (
          <TouchableOpacity key={s.key} style={[styles.pill, active && styles.pillActive]} onPress={() => setSection(s.key)}>
            <Feather name={s.icon} size={13} color={active ? colors.accent2 : colors.textDim} />
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  if (section === 'appointments') {
    return (
      <AppointmentsScreen
        appts={sharedAppts}
        header={switcher}
        title="Reports"
        canModify={(a) => isManager || a.user_id === user?.id}
      />
    );
  }

  async function onRefresh() {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await Promise.all([appts.refresh(), reloadAll()]);
    setRefreshing(false);
  }

  const userId = user?.id || '';

  return (
    <View style={styles.page}>
      <TopBar title="Reports" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {switcher}
        {section === 'goals' && (
          <GoalsReport
            userId={userId}
            userName={user?.name || 'Agent'}
            appointments={appts.appointments}
            sessions={sessions}
            refreshKey={refreshKey}
          />
        )}
        {section === 'workedtime' && <WorkedTimeReport sessions={sessions} />}
        {section === 'activity' && <ActivityReport userId={userId} refreshKey={refreshKey} />}
        {section === 'evaluations' && <EvaluationsReport userId={userId} refreshKey={refreshKey} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg0 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 0, paddingBottom: TAB_BAR_CLEARANCE },
  switcher: { gap: 8, paddingBottom: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillActive: { backgroundColor: 'rgba(255, 122, 24, 0.12)', borderColor: colors.accent },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.textDim },
  pillTextActive: { color: colors.accent2 },
});
