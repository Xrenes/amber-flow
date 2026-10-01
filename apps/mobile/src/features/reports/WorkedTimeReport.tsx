import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { Chips, EmptyState, SectionTitle, StatGrid, fmtClock, fmtHM, localDayKey, relLabel, shortDay, ui } from './reportUi';

export interface ReportSession {
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  project_name: string | null;
}

type Period = '7' | '30' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];
const TARGET = 8 * 3600;
const CHART_H = 150;
const LABEL_H = 18; // room under the bars for day labels
const PALETTE = ['#ff7a18', '#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#2dd4bf', '#fb923c'];

// The tracker stores "Campaign — Account"; hours are broken down by account.
function accountOf(project: string | null): string {
  if (!project) return 'Unassigned';
  const parts = project.split(' — ');
  return (parts[1] || parts[0] || 'Unassigned').trim() || 'Unassigned';
}

interface Day {
  date: string;
  total: number;
  firstIn: string;
  lastOut: string | null;
  count: number;
  slices: { account: string; seconds: number; pct: number }[];
}

// Mobile version of desktop's Worked Time report: period summary, daily
// stacked bars by account against an 8h target, hours per account, and a
// daily list (tap a day for its account split). Finished sessions only —
// the tracker saves a session when it's stopped.
export default function WorkedTimeReport({ sessions }: { sessions: ReportSession[] }) {
  const [period, setPeriod] = useState<Period>('7');
  const [open, setOpen] = useState<string | null>(null);

  const allDays = useMemo<Day[]>(() => {
    const map: Record<string, { acc: Record<string, number>; firstIn: string; lastOut: string | null; count: number }> = {};
    sessions.forEach((s) => {
      if (!s.start_time) return;
      const key = localDayKey(s.start_time);
      const d = (map[key] ||= { acc: {}, firstIn: s.start_time, lastOut: s.end_time, count: 0 });
      const a = accountOf(s.project_name);
      d.acc[a] = (d.acc[a] || 0) + (s.duration_seconds || 0);
      d.count += 1;
      if (new Date(s.start_time) < new Date(d.firstIn)) d.firstIn = s.start_time;
      if (s.end_time && (!d.lastOut || new Date(s.end_time) > new Date(d.lastOut))) d.lastOut = s.end_time;
    });
    return Object.entries(map)
      .map(([date, d]) => {
        const total = Object.values(d.acc).reduce((x, y) => x + y, 0);
        return {
          date,
          total,
          firstIn: d.firstIn,
          lastOut: d.lastOut,
          count: d.count,
          slices: Object.entries(d.acc)
            .map(([account, seconds]) => ({ account, seconds, pct: total ? (seconds / total) * 100 : 0 }))
            .sort((x, y) => y.seconds - x.seconds),
        };
      })
      .sort((x, y) => y.date.localeCompare(x.date));
  }, [sessions]);

  // One color per account everywhere, ranked by all-time hours.
  const colorOf = useMemo(() => {
    const totals: Record<string, number> = {};
    allDays.forEach((d) => d.slices.forEach((s) => (totals[s.account] = (totals[s.account] || 0) + s.seconds)));
    const map: Record<string, string> = {};
    Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .forEach(([a], i) => (map[a] = PALETTE[i % PALETTE.length]));
    return (a: string) => map[a] || PALETTE[0];
  }, [allDays]);

  const range = useMemo(() => {
    const n = period === 'all' ? 14 : period === '30' ? 30 : 7;
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(localDayKey(d));
    }
    return out;
  }, [period]);

  const days = period === 'all' ? allDays : allDays.filter((d) => d.date >= range[0]);
  const total = days.reduce((s, d) => s + d.total, 0);
  const best = days.reduce<Day | null>((b, d) => (!b || d.total > b.total ? d : b), null);
  const byAccount = useMemo(() => {
    const acc: Record<string, number> = {};
    days.forEach((d) => d.slices.forEach((s) => (acc[s.account] = (acc[s.account] || 0) + s.seconds)));
    return Object.entries(acc)
      .map(([account, seconds]) => ({ account, seconds, pct: total ? (seconds / total) * 100 : 0 }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [days, total]);
  const dayMap = useMemo(() => Object.fromEntries(allDays.map((d) => [d.date, d])), [allDays]);
  const chartMax = Math.max(TARGET, ...range.map((k) => dayMap[k]?.total || 0));

  if (!allDays.length) {
    return <EmptyState title="No worked time yet" body="Start the Time Tracker, and your hours will show up here by day and account." />;
  }

  return (
    <View>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />

      <StatGrid
        items={[
          { value: `${(total / 3600).toFixed(1)}h`, label: 'Total worked', color: colors.accent2 },
          { value: String(days.length), label: 'Days worked' },
          { value: days.length ? `${(total / days.length / 3600).toFixed(1)}h` : '—', label: 'Average per day' },
          { value: best ? `${(best.total / 3600).toFixed(1)}h` : '—', label: 'Best day', sub: best ? shortDay(best.date) : undefined },
        ]}
      />

      <View style={[ui.card, styles.chartCard]}>
        <View style={styles.chartHead}>
          <Text style={styles.chartTitle}>Daily hours</Text>
          <Text style={styles.chartKey}>- - 8h target</Text>
        </View>
        <View style={styles.chart}>
          <View style={[styles.target, { bottom: LABEL_H + (TARGET / chartMax) * (CHART_H - LABEL_H) }]} />
          {range.map((k, i) => {
            const d = dayMap[k];
            const h = d ? (d.total / chartMax) * 100 : 0;
            const isToday = i === range.length - 1;
            const showLabel = range.length <= 7 || i % 5 === 0 || isToday;
            const [y, m, dd] = k.split('-').map(Number);
            const date = new Date(y, m - 1, dd, 12);
            return (
              <TouchableOpacity key={k} style={styles.col} onPress={() => d && setOpen(open === k ? null : k)} activeOpacity={0.7}>
                <View style={styles.colTrack}>
                  <View style={[styles.stack, { height: `${h}%` }]}>
                    {d?.slices.map((s) => (
                      <View key={s.account} style={{ flex: s.seconds, backgroundColor: colorOf(s.account) }} />
                    ))}
                  </View>
                </View>
                <Text style={[styles.colLabel, isToday && styles.colToday]}>
                  {showLabel ? (range.length <= 7 ? date.toLocaleDateString('en-US', { weekday: 'narrow' }) : date.getDate()) : ' '}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <SectionTitle>By account</SectionTitle>
      <View style={[ui.card, styles.accounts]}>
        {byAccount.length === 0 && <Text style={ui.muted}>No hours in this period.</Text>}
        {byAccount.map((a) => (
          <View key={a.account} style={styles.accRow}>
            <View style={styles.accTop}>
              <View style={[styles.dot, { backgroundColor: colorOf(a.account) }]} />
              <Text style={styles.accName} numberOfLines={1}>
                {a.account}
              </Text>
              <Text style={styles.accHours}>{fmtHM(a.seconds)}</Text>
              <Text style={styles.accPct}>{Math.round(a.pct)}%</Text>
            </View>
            <View style={styles.accBar}>
              <View style={{ width: `${a.pct}%`, height: '100%', backgroundColor: colorOf(a.account), borderRadius: 999 }} />
            </View>
          </View>
        ))}
      </View>

      <SectionTitle>Daily log</SectionTitle>
      <View style={styles.log}>
        {days.map((d) => {
          const isOpen = open === d.date;
          const rel = relLabel(d.date);
          return (
            <TouchableOpacity key={d.date} style={[ui.card, styles.dayCard]} onPress={() => setOpen(isOpen ? null : d.date)} activeOpacity={0.8}>
              <View style={styles.dayTop}>
                <Text style={styles.dayName}>{shortDay(d.date)}</Text>
                {rel ? <Text style={[styles.rel, rel === 'Today' && styles.relToday]}>{rel}</Text> : null}
                <Text style={styles.dayTotal}>
                  {fmtHM(d.total)}
                  {d.total >= TARGET ? <Text style={styles.met}> ✓</Text> : null}
                </Text>
              </View>
              <View style={styles.split}>
                {d.slices.map((s) => (
                  <View key={s.account} style={{ width: `${s.pct}%`, backgroundColor: colorOf(s.account) }} />
                ))}
              </View>
              <Text style={styles.dayMeta}>
                {fmtClock(d.firstIn)} – {fmtClock(d.lastOut)} · {d.count} session{d.count === 1 ? '' : 's'}
              </Text>
              {isOpen && (
                <View style={styles.detail}>
                  {d.slices.map((s) => (
                    <View key={s.account} style={styles.accTop}>
                      <View style={[styles.dot, { backgroundColor: colorOf(s.account) }]} />
                      <Text style={styles.accName} numberOfLines={1}>
                        {s.account}
                      </Text>
                      <Text style={styles.accHours}>{fmtHM(s.seconds)}</Text>
                      <Text style={styles.accPct}>{Math.round(s.pct)}%</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: { marginBottom: 14 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  chartKey: { fontSize: 11, color: colors.textDim },
  chart: { height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 3, position: 'relative', paddingBottom: LABEL_H },
  target: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 1,
  },
  col: { flex: 1, height: '100%' },
  colTrack: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 4, overflow: 'hidden' },
  stack: { flexDirection: 'column-reverse', borderRadius: 4, overflow: 'hidden' },
  colLabel: { position: 'absolute', bottom: -16, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: colors.textDim },
  colToday: { color: colors.accent, fontWeight: '700' },
  accounts: { gap: 12, marginBottom: 14 },
  accRow: { gap: 6 },
  accTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  accName: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  accHours: { fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  accPct: { width: 36, textAlign: 'right', fontSize: 11, color: colors.textDim },
  accBar: { height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  log: { gap: 10 },
  dayCard: { gap: 8 },
  dayTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  dayTotal: { marginLeft: 'auto', fontSize: 15, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  met: { color: colors.success, fontSize: 13 },
  split: { flexDirection: 'row', height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  dayMeta: { fontSize: 11, color: colors.textDim },
  detail: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
