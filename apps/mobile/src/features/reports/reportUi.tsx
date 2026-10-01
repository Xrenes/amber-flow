import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

// Small building blocks shared by the mobile Reports sections, matching the
// desktop My Reports look: a summary strip of stats, chips, cards.

export function localDayKey(d: Date | string | number): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function relLabel(key: string): string {
  const today = localDayKey(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return 'Today';
  if (key === localDayKey(y)) return 'Yesterday';
  return '';
}

export function shortDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtHM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtClock(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
}

export interface StatItem {
  value: string;
  label: string;
  sub?: string;
  color?: string;
}

// 2-column grid of stats in one bordered panel (reads like desktop's strip).
export function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <View style={ui.grid}>
      {items.map((s, i) => (
        <View
          key={s.label}
          style={[
            ui.cell,
            i % 2 === 0 && ui.cellLeft,
            i < items.length - (items.length % 2 === 0 ? 2 : 1) && ui.cellTop,
            items.length % 2 === 1 && i === items.length - 1 && ui.cellFull,
          ]}
        >
          <Text style={[ui.value, s.color ? { color: s.color } : null]} numberOfLines={1} adjustsFontSizeToFit>
            {s.value}
          </Text>
          <Text style={ui.label}>{s.label}</Text>
          {s.sub ? <Text style={ui.sub}>{s.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={ui.chips}>
      {options.map((o) => (
        <TouchableOpacity key={o.key} style={[ui.chip, value === o.key && ui.chipActive]} onPress={() => onChange(o.key)}>
          <Text style={[ui.chipText, value === o.key && ui.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={ui.sectionHead}>
      <Text style={ui.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={ui.empty}>
      <Text style={ui.emptyTitle}>{title}</Text>
      <Text style={ui.emptyBody}>{body}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cell: { width: '50%', paddingVertical: 12, paddingHorizontal: 14 },
  cellLeft: { borderRightWidth: 1, borderRightColor: colors.border },
  cellTop: { borderBottomWidth: 1, borderBottomColor: colors.border },
  cellFull: { width: '100%', borderRightWidth: 0 },
  value: { fontSize: 20, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 11, color: colors.textDim, marginTop: 1 },
  sub: { fontSize: 10, color: colors.textDim, opacity: 0.8, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: 'rgba(255, 122, 24, 0.12)', borderColor: colors.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textDim },
  chipTextActive: { color: colors.accent2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
  emptyBody: { fontSize: 13, color: colors.textDim, textAlign: 'center', lineHeight: 19 },
  muted: { fontSize: 13, color: colors.textDim },
});
