import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Appointment } from '@amber-flow/shared';
import { apptDayKey } from '../features/appointments/apptFormat';
import { colors } from '../theme/colors';

interface Props {
  appointments: Appointment[];
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Home dashboard summary — same numbers as desktop's AppointmentStats
// (Today / Upcoming / Completed / Missed + completion rate), in one compact
// panel: four equal columns with dividers, completion bar underneath.
export default function AppointmentSummary({ appointments }: Props) {
  const today = todayKey();
  const now = Date.now();
  const todayCount = appointments.filter((a) => apptDayKey(a) === today).length;
  const upcoming = appointments.filter((a) => a.status === 'pending' && new Date(a.scheduled_time).getTime() >= now).length;
  const done = appointments.filter((a) => a.status === 'completed').length;
  const missed = appointments.filter((a) => a.status === 'missed').length;
  const decided = done + missed;
  const pct = decided ? Math.round((done / decided) * 100) : null;

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Stat value={todayCount} label="Today" />
        <View style={styles.divider} />
        <Stat value={upcoming} label="Upcoming" color={colors.accent2} />
        <View style={styles.divider} />
        <Stat value={done} label="Done" color={colors.success} />
        <View style={styles.divider} />
        <Stat value={missed} label="Missed" color={missed ? colors.danger : undefined} />
      </View>
      <View style={styles.rate}>
        <View style={styles.rateTop}>
          <Text style={styles.rateLabel}>Completion rate</Text>
          <Text style={styles.rateVal}>{pct === null ? '—' : `${pct}%`}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct ?? 0}%` }]} />
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: colors.textDim, marginTop: 1 },
  rate: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  rateTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rateLabel: { fontSize: 12, color: colors.textDim },
  rateVal: { fontSize: 14, fontWeight: '800', color: colors.accent2 },
  track: { height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
});
