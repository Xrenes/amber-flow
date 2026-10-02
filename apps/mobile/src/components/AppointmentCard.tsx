import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Appointment, ShowStatus } from '@amber-flow/shared';
import { apptTimeLabel, apptTzShort, apptDayKey, bookedLabel, dayHeading, initials } from '../features/appointments/apptFormat';
import { colors } from '../theme/colors';

const STATUS: Record<Appointment['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: colors.accent, bg: 'rgba(255, 122, 24, 0.12)' },
  completed: { label: 'Completed', color: colors.success, bg: 'rgba(74, 222, 128, 0.12)' },
  missed: { label: 'Missed', color: colors.danger, bg: 'rgba(239, 68, 68, 0.12)' },
};

function outcome(s: ShowStatus): { label: string; color: string; border: string; dashed: boolean } {
  if (s === 'showed') return { label: 'Showed', color: colors.success, border: 'rgba(74, 222, 128, 0.35)', dashed: false };
  if (s === 'no_show') return { label: 'No-show', color: colors.danger, border: 'rgba(239, 68, 68, 0.35)', dashed: false };
  return { label: 'Outcome unknown', color: colors.textDim, border: colors.border, dashed: true };
}

interface AppointmentCardProps {
  appointment: Appointment;
  agentName?: string;
  /** Compact = Home screen preview (shows the date, no actions). Full = Appointments tab (date comes from the group header). */
  variant?: 'compact' | 'full';
  resolving?: boolean;
  onDone?: () => void;
  onMiss?: () => void;
  onRevert?: () => void;
  onDelete?: () => void;
  onResolveOpen?: () => void;
  onResolve?: (s: ShowStatus) => void;
  onResolveCancel?: () => void;
}

// One appointment in the Admin → Appointments format, reflowed for phone
// width: agent avatar + name, account (with title beneath), time in the
// appointment's own timezone, a colored status pill, and the outcome tag.
export default function AppointmentCard({
  appointment: a,
  agentName,
  variant = 'full',
  resolving,
  onDone,
  onMiss,
  onRevert,
  onDelete,
  onResolveOpen,
  onResolve,
  onResolveCancel,
}: AppointmentCardProps) {
  const compact = variant === 'compact';
  // The admin-managed Agent list name recorded on the appointment — never a
  // login/display name.
  const agent = a.agent_name || agentName || '—';
  const account = a.account_name || a.project_name;
  const tzShort = apptTzShort(a);
  const st = STATUS[a.status] || STATUS.pending;
  const out = a.show_status ? outcome(a.show_status) : null;
  const resolvable = a.show_status === 'uncertain' && !!onResolveOpen;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(agent) || '?'}</Text>
        </View>
        <View style={styles.main}>
          <View style={styles.headRow}>
            <Text style={styles.agent} numberOfLines={1}>
              {agent}
            </Text>
            <View style={styles.timeWrap}>
              {compact && <Text style={styles.date}>{dayHeading(apptDayKey(a)).replace(/, \d{4}$/, '')}</Text>}
              <Text style={styles.time}>{apptTimeLabel(a)}</Text>
              {tzShort ? (
                <View style={styles.tzBadge}>
                  <Text style={styles.tzBadgeText}>{tzShort}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.account} numberOfLines={1}>
            {account || '—'}
          </Text>
          {a.title && a.title !== account ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {a.title}
            </Text>
          ) : null}
          {a.created_at ? <Text style={styles.booked}>Booked {bookedLabel(a)}</Text> : null}

          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: st.bg }]}>
              <View style={[styles.dot, { backgroundColor: st.color }]} />
              <Text style={[styles.pillText, { color: st.color }]}>{st.label}</Text>
            </View>
            {out && !resolving && (
              <TouchableOpacity disabled={!resolvable} onPress={onResolveOpen}>
                <View style={[styles.outcome, { borderColor: out.border, borderStyle: out.dashed ? 'dashed' : 'solid' }]}>
                  <Text style={[styles.outcomeText, { color: out.color }]}>
                    {out.label}
                    {resolvable ? ' · tap to set' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {resolving && (
            <View style={styles.resolveRow}>
              <TouchableOpacity style={styles.showBtn} onPress={() => onResolve?.('showed')}>
                <Text style={styles.showBtnText}>Showed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.noShowBtn} onPress={() => onResolve?.('no_show')}>
                <Text style={styles.noShowBtnText}>No-show</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onResolveCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {!compact && (onDone || onMiss || onRevert || onDelete) && (
            <View style={styles.actions}>
              {a.status === 'pending' && onDone && (
                <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              )}
              {a.status === 'pending' && onMiss && (
                <TouchableOpacity style={styles.missBtn} onPress={onMiss}>
                  <Text style={styles.missBtnText}>Miss</Text>
                </TouchableOpacity>
              )}
              {a.status === 'completed' && onRevert && (
                <TouchableOpacity style={styles.revertBtn} onPress={onRevert}>
                  <Text style={styles.revertBtnText}>Undo</Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  top: { flexDirection: 'row', gap: 12 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 122, 24, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 24, 0.25)',
  },
  avatarText: { color: colors.accent2, fontSize: 12, fontWeight: '700' },
  main: { flex: 1, gap: 3 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  agent: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  date: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  time: { color: colors.text, fontSize: 13, fontWeight: '700' },
  tzBadge: { backgroundColor: 'rgba(255, 122, 24, 0.12)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tzBadgeText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  account: { color: colors.text, fontSize: 13, fontWeight: '500' },
  subtitle: { color: colors.textDim, fontSize: 12 },
  booked: { color: colors.textDim, fontSize: 11, opacity: 0.85 },
  pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
  outcome: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  outcomeText: { fontSize: 12, fontWeight: '500' },
  resolveRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  showBtn: { backgroundColor: 'rgba(74, 222, 128, 0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  showBtnText: { color: colors.success, fontWeight: '700', fontSize: 12 },
  noShowBtn: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  noShowBtnText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  cancelText: { color: colors.textDim, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },
  doneBtn: { backgroundColor: 'rgba(74, 222, 128, 0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  doneBtnText: { color: colors.success, fontWeight: '700', fontSize: 12 },
  missBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  missBtnText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  revertBtn: { backgroundColor: 'rgba(148, 163, 184, 0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  revertBtnText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  deleteBtn: { marginLeft: 'auto' },
  deleteText: { color: colors.danger, fontSize: 12 },
});
