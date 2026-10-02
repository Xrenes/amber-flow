import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  agentNamesForGoals,
  computeAgentNameAttainmentRow,
  listAgentGoals,
  listAllTimeSessionsForReports,
  periodRange,
} from '@amber-flow/shared';
import type { AgentGoal, Appointment, PeriodKey, TimeSession } from '@amber-flow/shared';
import ArcGauge from '../../components/ArcGauge';
import { colors } from '../../theme/colors';
import { useTaskFieldOptions } from '../../hooks/useTaskFieldOptions';
import { useTeamDirectory } from '../../hooks/useTeamDirectory';
import { Chips, StatGrid, ui } from './reportUi';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
];

function fmtRange(r: { start: Date; end: Date }): string {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${r.start.toLocaleDateString('en-US', o)} – ${r.end.toLocaleDateString('en-US', o)}`;
}

// Mobile version of desktop My Reports → Goals: the same attainment math
// (packages/shared/src/goalAttainment.ts), by agent name over everyone's
// appointments and tracked sessions — the same numbers for any login.
// Goals and sessions load once per open; pull down to refresh.
export default function GoalsReport({
  userId,
  userName,
  appointments,
  refreshKey,
}: {
  userId: string;
  userName: string;
  // Everyone's appointments (Reports' shared list).
  appointments: Appointment[];
  refreshKey: number;
}) {
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [agent, setAgent] = useState(userName);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const agentField = useTaskFieldOptions('agent');
  const { members } = useTeamDirectory();
  const profileNames = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name || ''])), [members]);

  useEffect(() => {
    let cancelled = false;
    listAllTimeSessionsForReports().then(({ data }) => {
      if (!cancelled && data) setSessions(data as TimeSession[]);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listAgentGoals().then(({ data }) => {
      if (cancelled) return;
      if (data) setGoals(data as AgentGoal[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const range = useMemo(() => periodRange(period, new Date()), [period]);
  const agentNames = useMemo(
    () => agentNamesForGoals([userName, ...agentField.options.map((o) => o.value)], appointments, sessions, profileNames),
    [userName, agentField.options, appointments, sessions, profileNames]
  );
  const isMe = agent.trim().toLowerCase() === userName.trim().toLowerCase();
  const row = useMemo(() => {
    // Per-agent goal overrides belong to the login with this name, if any.
    const login = isMe
      ? userId
      : Object.keys(profileNames).find((id) => profileNames[id].trim().toLowerCase() === agent.trim().toLowerCase());
    return computeAgentNameAttainmentRow(agent, appointments, sessions, goals, range, profileNames, login ?? null);
  }, [agent, isMe, userId, appointments, sessions, goals, range, profileNames]);

  if (loading) return <Text style={ui.muted}>Loading goals…</Text>;

  // The goal is (daily goal × days with tracked time), so no tracked days
  // means a zero goal even when a daily goal exists.
  const noTracked = row.activeDays === 0;
  const noGoal = noTracked || (row.calcAppointmentGoal === 0 && row.calcShowGoal === 0);
  const tone = noGoal ? colors.textDim : row.meetsGoal ? colors.success : colors.accent;

  return (
    <View>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      <Chips options={agentNames.map((n) => ({ key: n, label: n }))} value={agent} onChange={setAgent} />

      <View style={[styles.banner, { borderLeftColor: tone }]}>
        <Text style={styles.bannerTitle}>
          {noTracked
            ? 'No tracked days in this period yet'
            : noGoal
              ? `No goal set for ${isMe ? 'you' : agent} yet`
              : row.meetsGoal
                ? isMe
                  ? 'You’re meeting your goal'
                  : `${agent} is meeting the goal`
                : 'Below goal so far'}
        </Text>
        <Text style={styles.bannerSub}>
          {fmtRange(range)}
          {noTracked ? ' · Goals count days you use the Time Tracker.' : ''}
        </Text>
      </View>

      <View style={styles.rings}>
        <Ring label="Appointments" value={row.appointments} goal={row.calcAppointmentGoal} pct={row.appAttainmentPct} />
        <Ring label="Shows" value={row.shows} goal={row.calcShowGoal} pct={row.showAttainmentPct} />
      </View>

      <StatGrid
        items={[
          { value: `${Math.round(row.showRatePct)}%`, label: 'Show rate', sub: 'Shows out of appointments' },
          { value: String(row.activeDays), label: 'Active days', sub: 'Days you used the tracker' },
          { value: `${row.hours.toFixed(1)}h`, label: 'Hours worked', sub: 'Finished tracker sessions' },
        ]}
      />
    </View>
  );
}

function Ring({ label, value, goal, pct }: { label: string; value: number; goal: number; pct: number }) {
  return (
    <View style={[ui.card, styles.ringCard]}>
      <ArcGauge pct={Math.max(0, Math.min(100, pct))} size={120} strokeWidth={11} centerText={goal ? `${Math.round(pct)}%` : '—'} centerLabel="of goal" />
      <Text style={styles.ringLabel}>{label}</Text>
      <Text style={styles.ringValue}>
        {value}
        <Text style={styles.ringGoal}> / {goal || '—'}</Text>
      </Text>
      {goal > value ? (
        <Text style={styles.ringLeft}>{goal - value} more to go</Text>
      ) : goal > 0 ? (
        <Text style={styles.ringDone}>Goal reached</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 14,
  },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  bannerSub: { fontSize: 12, color: colors.textDim, marginTop: 3 },
  rings: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  ringCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  ringLabel: { fontSize: 12, color: colors.textDim, marginTop: 4 },
  ringValue: { fontSize: 22, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  ringGoal: { fontSize: 14, fontWeight: '600', color: colors.textDim },
  ringLeft: { fontSize: 11, color: colors.accent2, marginTop: 4 },
  ringDone: { fontSize: 11, color: colors.success, fontWeight: '700', marginTop: 4 },
});
