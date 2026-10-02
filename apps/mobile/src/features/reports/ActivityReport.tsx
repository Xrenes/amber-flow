import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { listActivityLogsByUser } from '@amber-flow/shared';
import type { ActivityLog } from '@amber-flow/shared';
import { colors } from '../../theme/colors';
import { EmptyState, SectionTitle, StatGrid, fmtClock, localDayKey, relLabel, shortDay, ui } from './reportUi';

interface Day {
  date: string;
  firstStart: string | null;
  lastStop: string | null;
  breaks: number;
  booked: number;
  completed: number;
  missed: number;
  idle: number; // seconds
  logs: ActivityLog[]; // oldest first
}

const HIDDEN = new Set(['STATUS_ACTIVE']);

function groupDays(logs: ActivityLog[]): Day[] {
  const map: Record<string, ActivityLog[]> = {};
  logs.forEach((l) => {
    if (l.created_at) (map[localDayKey(l.created_at)] ||= []).push(l);
  });
  return Object.entries(map)
    .map(([date, list]) => {
      const chrono = [...list].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const d: Day = { date, firstStart: null, lastStop: null, breaks: 0, booked: 0, completed: 0, missed: 0, idle: 0, logs: chrono };
      let idleStart: number | null = null;
      chrono.forEach((l) => {
        const t = new Date(l.created_at as string).getTime();
        if (l.action_type === 'START_TRACKER' && !d.firstStart) d.firstStart = l.created_at as string;
        if (l.action_type === 'STOP_TRACKER') d.lastStop = l.created_at as string;
        if (l.action_type === 'START_BREAK') d.breaks += 1;
        if (l.action_type === 'CREATE_APPOINTMENT' || l.action_type === 'COMPLETE_TASK') d.booked += 1;
        if (l.action_type === 'COMPLETE_APPOINTMENT') d.completed += 1;
        if (l.action_type === 'MISS_APPOINTMENT') d.missed += 1;
        if (l.action_type === 'STATUS_IDLE' || l.action_type === 'STATUS_AWAY') {
          if (idleStart === null) idleStart = t;
        } else if (l.action_type === 'STATUS_ACTIVE' && idleStart !== null) {
          d.idle += (t - idleStart) / 1000;
          idleStart = null;
        }
      });
      return d;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function describe(l: ActivityLog): { label: string; detail?: string; icon: keyof typeof Feather.glyphMap; color: string } {
  const m = (l.metadata || {}) as Record<string, unknown>;
  const project = (m.project as string) || (m.projectName as string) || '';
  const appt = [m.title, m.accountName].filter(Boolean).join(' — ') || undefined;
  switch (l.action_type) {
    case 'START_TRACKER':
      return { label: 'Started tracking', detail: project || undefined, icon: 'play-circle', color: colors.success };
    case 'RESUME_TRACKER':
      return { label: 'Resumed tracking', detail: project || undefined, icon: 'play-circle', color: colors.success };
    case 'STOP_TRACKER':
      return { label: 'Stopped tracking', detail: project || undefined, icon: 'stop-circle', color: colors.danger };
    case 'START_BREAK':
      return { label: 'Started a break', icon: 'pause', color: colors.accent2 };
    case 'END_BREAK':
      return { label: 'Back from break', icon: 'play', color: colors.accent2 };
    case 'CREATE_APPOINTMENT':
    case 'COMPLETE_TASK':
      return { label: 'Booked an appointment', detail: appt, icon: 'calendar', color: colors.text };
    case 'COMPLETE_APPOINTMENT':
      return { label: 'Completed an appointment', detail: appt, icon: 'check-square', color: colors.success };
    case 'MISS_APPOINTMENT':
      return { label: 'Missed an appointment', detail: appt, icon: 'x-square', color: colors.danger };
    case 'UPDATE_APPOINTMENT':
      return { label: 'Updated an appointment', detail: appt, icon: 'edit-3', color: colors.textDim };
    case 'DELETE_APPOINTMENT':
      return { label: 'Deleted an appointment', detail: appt, icon: 'trash-2', color: colors.textDim };
    case 'IMPORT_APPOINTMENT':
    case 'IMPORT_UPDATE_APPOINTMENT':
      return { label: 'Imported from a sheet', detail: appt, icon: 'upload', color: colors.textDim };
    case 'STATUS_IDLE':
      return { label: 'Went idle', icon: 'moon', color: colors.textDim };
    case 'STATUS_AWAY':
      return { label: 'Went away', icon: 'moon', color: colors.textDim };
    default:
      return { label: l.action_type.replace(/_/g, ' ').toLowerCase(), icon: 'circle', color: colors.textDim };
  }
}

// Mobile version of desktop My Reports → Activity: start/stop, breaks,
// idle time (needs the Idle/Active Status plugin) and appointments per day;
// tap a day for its timeline. Loads when opened; pull down to refresh.
export default function ActivityReport({ userId, refreshKey }: { userId: string; refreshKey: number }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listActivityLogsByUser(userId).then(({ data }) => {
      if (cancelled) return;
      if (data) setLogs(data as ActivityLog[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const days = useMemo(() => groupDays(logs), [logs]);
  const week = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const cutoff = localDayKey(d);
    const recent = days.filter((x) => x.date >= cutoff);
    return {
      active: recent.filter((x) => x.firstStart).length,
      booked: recent.reduce((s, x) => s + x.booked, 0),
      completed: recent.reduce((s, x) => s + x.completed, 0),
      missed: recent.reduce((s, x) => s + x.missed, 0),
    };
  }, [days]);

  if (loading) return <Text style={ui.muted}>Loading activity…</Text>;
  if (!days.length) return <EmptyState title="No activity yet" body="Start the Time Tracker or book an appointment, and your day will show up here." />;

  const today = days.find((d) => d.date === localDayKey(new Date()));

  return (
    <View>
      <StatGrid
        items={[
          {
            value: today?.firstStart ? fmtClock(today.firstStart) : '—',
            label: 'Started today',
            sub: today?.breaks ? `${today.breaks} break${today.breaks > 1 ? 's' : ''}` : 'No breaks yet',
            color: colors.accent2,
          },
          { value: `${week.active}/7`, label: 'Days active', sub: 'Last 7 days' },
          { value: String(week.booked), label: 'Booked', sub: 'Last 7 days' },
          { value: String(week.completed), label: 'Completed', sub: week.missed ? `${week.missed} missed` : 'None missed', color: colors.success },
        ]}
      />

      <SectionTitle>By day</SectionTitle>
      <View style={styles.list}>
        {days.map((d) => {
          const isOpen = open === d.date;
          const rel = relLabel(d.date);
          return (
            <TouchableOpacity key={d.date} style={[ui.card, styles.day]} onPress={() => setOpen(isOpen ? null : d.date)} activeOpacity={0.8}>
              <View style={styles.dayTop}>
                <Feather name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} color={colors.textDim} />
                <Text style={styles.dayName}>{shortDay(d.date)}</Text>
                {rel ? <Text style={[styles.rel, rel === 'Today' && styles.relToday]}>{rel}</Text> : null}
              </View>
              <View style={styles.facts}>
                <Fact label="Started" value={fmtClock(d.firstStart)} />
                <Fact label="Stopped" value={fmtClock(d.lastStop)} />
                <Fact label="Breaks" value={d.breaks ? String(d.breaks) : '—'} />
                <Fact label="Idle" value={d.idle >= 60 ? `${Math.round(d.idle / 60)}m` : '—'} />
              </View>
              <View style={styles.chips}>
                <Text style={[styles.chip, styles.chipNeutral]}>{d.booked} booked</Text>
                {d.completed > 0 && <Text style={[styles.chip, styles.chipGood]}>{d.completed} done</Text>}
                {d.missed > 0 && <Text style={[styles.chip, styles.chipBad]}>{d.missed} missed</Text>}
              </View>
              {isOpen && (
                <View style={styles.timeline}>
                  {d.logs
                    .filter((l) => !HIDDEN.has(l.action_type))
                    .map((l, i) => {
                      const e = describe(l);
                      return (
                        <View key={l.id || i} style={styles.event}>
                          <Text style={styles.eventTime}>{fmtClock(l.created_at)}</Text>
                          <View style={styles.node}>
                            <Feather name={e.icon} size={12} color={e.color} />
                          </View>
                          <View style={styles.eventBody}>
                            <Text style={styles.eventLabel}>{e.label}</Text>
                            {e.detail ? <Text style={styles.eventDetail}>{e.detail}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  day: { gap: 10 },
  dayTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayName: { fontSize: 14, fontWeight: '700', color: colors.text },
  rel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textDim,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  relToday: { color: colors.accent, borderColor: 'rgba(255,122,24,0.4)' },
  facts: { flexDirection: 'row' },
  fact: { flex: 1 },
  factValue: { fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  factLabel: { fontSize: 10, color: colors.textDim, marginTop: 1 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { fontSize: 11, fontWeight: '600', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
  chipNeutral: { color: colors.textDim, backgroundColor: 'rgba(255,255,255,0.05)' },
  chipGood: { color: colors.success, backgroundColor: 'rgba(74,222,128,0.12)' },
  chipBad: { color: colors.danger, backgroundColor: 'rgba(239,68,68,0.12)' },
  timeline: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 10 },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eventTime: { width: 62, textAlign: 'right', fontSize: 11, color: colors.textDim, paddingTop: 4, fontVariant: ['tabular-nums'] },
  node: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventBody: { flex: 1, paddingTop: 2 },
  eventLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  eventDetail: { fontSize: 11, color: colors.textDim, marginTop: 1 },
});
