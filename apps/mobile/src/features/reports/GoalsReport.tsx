import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { listAgentGoals, computeAgentAttainmentRow, periodRange } from '@amber-flow/shared';
import type { AgentGoal, Appointment, PeriodKey, TimeSession } from '@amber-flow/shared';
import ArcGauge from '../../components/ArcGauge';
import { colors } from '../../theme/colors';
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
// (packages/shared/src/goalAttainment.ts) on this agent's own appointments
// and tracked sessions. Goals load once per open; pull down to refresh.
export default function GoalsReport({
  userId,
  userName,
  appointments,
  sessions,
  refreshKey,
}: {
  userId: string;
  userName: string;
  appointments: Appointment[];
  sessions: TimeSession[];
  refreshKey: number;
}) {
  const [period, setPeriod] = useState<PeriodKey>('week');
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
  const row = useMemo(
    () => computeAgentAttainmentRow(userId, userName, appointments, sessions, goals, range),
    [userId, userName, appointments, sessions, goals, range]
  );

  if (loading) return <Text style={ui.muted}>Loading goals…</Text>;

  // The goal is (daily goal × days with tracked time), so no tracked days
  // means a zero goal even when a daily goal exists.
  const noTracked = row.activeDays === 0;
  const noGoal = noTracked || (row.calcAppointmentGoal === 0 && row.calcShowGoal === 0);
  const tone = noGoal ? colors.textDim : row.meetsGoal ? colors.success : colors.accent;

  return (
    <View>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />

      <View style={[styles.banner, { borderLeftColor: tone }]}>
        <Text style={styles.bannerTitle}>
          {noTracked
            ? 'No tracked days in this period yet'
            : noGoal
              ? 'No goal set for you yet'
              : row.meetsGoal
                ? 'You’re meeting your goal'
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
