import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildAgentOptions, parseAgentValue } from '@amber-flow/shared';
import { useAuth } from '../auth/AuthContext';
import { useAppointments, type NewAppointmentInput, type UseAppointmentsResult } from '../features/appointments/useAppointments';
import { useTaskFieldOptions } from '../hooks/useTaskFieldOptions';
import { useTeamDirectory } from '../hooks/useTeamDirectory';
import { useSettings } from '../features/settings/SettingsContext';
import { browserTimezone, tzLocalToUTC, utcToTZLocal } from '../features/appointments/tzUtil';
import { dayHeading, groupByDay, relativeDay } from '../features/appointments/apptFormat';

type ApptFilter = 'all' | 'pending' | 'completed' | 'missed';
import Dropdown from '../components/Dropdown';
import TopBar from '../components/TopBar';
import AppointmentCard from '../components/AppointmentCard';
import { TAB_BAR_CLEARANCE } from '../theme/layout';
import { colors } from '../theme/colors';

interface AppointmentsScreenProps {
  /** Shared appointments state from the parent (Reports) so there's only one realtime subscription. */
  appts?: UseAppointmentsResult;
  /** Rendered above the summary — the Reports section switcher. */
  header?: React.ReactNode;
  title?: string;
}

export default function AppointmentsScreen({ appts: sharedAppts, header, title: screenTitle = 'Appointments' }: AppointmentsScreenProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Only used when no parent passes shared state in (hooks can't be conditional).
  const ownAppts = useAppointments(sharedAppts ? undefined : user?.id);
  const appts = sharedAppts || ownAppts;
  const { settings } = useSettings();
  const accountField = useTaskFieldOptions('account');
  const projectField = useTaskFieldOptions('project');
  const agentNameField = useTaskFieldOptions('agent');
  const { members: teamMembers } = useTeamDirectory();
  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {};
    teamMembers.forEach((m) => {
      map[m.id] = m.name;
    });
    if (user?.id) map[user.id] = user.name;
    return map;
  }, [teamMembers, user]);

  const [modalOpen, setModalOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(new Date(Date.now() + 3600000));
  const [showPicker, setShowPicker] = useState<'date' | 'time' | null>(null);
  const [accountName, setAccountName] = useState('');
  const [agentText, setAgentText] = useState(''); // Agent field in Free text mode
  const [assignedUserId, setAssignedUserId] = useState(user?.id || '');

  const assigneeOptions = useMemo(() => {
    if (!user?.id) return teamMembers;
    if (teamMembers.some((m) => m.id === user.id)) return teamMembers;
    return [{ id: user.id, name: user.name }, ...teamMembers];
  }, [teamMembers, user]);

  // Same format as desktop Admin → Appointments: a summary strip (tap a
  // count to filter) over a list grouped by scheduled date, newest first.
  const [filter, setFilter] = useState<ApptFilter>('all');

  const sections = useMemo(() => {
    const list = appts.appointments
      .filter((a) => filter === 'all' || (a.status || 'pending') === filter)
      .sort((a, b) => (b.scheduled_time || '').localeCompare(a.scheduled_time || ''));
    return groupByDay(list).map(({ key, items }) => ({ key, data: items }));
  }, [appts.appointments, filter]);

  const counts = useMemo(() => {
    const all = appts.appointments;
    const showed = all.filter((a) => a.show_status === 'showed').length;
    const noShow = all.filter((a) => a.show_status === 'no_show').length;
    return {
      all: all.length,
      pending: all.filter((a) => a.status === 'pending').length,
      completed: all.filter((a) => a.status === 'completed').length,
      missed: all.filter((a) => a.status === 'missed').length,
      showed,
      noShow,
      unknown: all.filter((a) => a.show_status === 'uncertain').length,
      showRate: showed + noShow ? Math.round((showed / (showed + noShow)) * 100) : null,
    };
  }, [appts.appointments]);

  function resetForm() {
    setTitle('');
    setProjectName('');
    setDescription('');
    setWhen(new Date(Date.now() + 3600000));
    setAccountName('');
    setAgentText('');
    setAssignedUserId(user?.id || '');
  }

  async function handleCreate() {
    if (!title.trim() || !projectName.trim()) return;
    const tz = browserTimezone();
    const localStr = utcToTZLocal(when.toISOString(), tz);
    const input: NewAppointmentInput = {
      title: title.trim(),
      projectName: projectName.trim(),
      description: description.trim(),
      scheduledTime: tzLocalToUTC(localStr, tz),
      timezone: tz,
      reminderMinutes: settings.defaultReminderMins ?? 30,
      accountName,
      ...(() => {
        // Free text mode: the typed name is the agent (blank = me).
        if (agentNameField.mode === 'text') {
          return { assignedUserId: user?.id || '', agentName: agentText.trim() || null };
        }
        const { userId, agentName } = parseAgentValue(assignedUserId, user?.id || '');
        return { assignedUserId: userId, agentName };
      })(),
    };
    await appts.createAppointment(input);
    resetForm();
    setModalOpen(false);
  }

  return (
    <View style={styles.page}>
      <TopBar
        title={screenTitle}
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        }
      />

      <SectionList
        sections={sections}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <>
            {header}
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Segment label="Total" value={counts.all} color={colors.text} active={filter === 'all'} onPress={() => setFilter('all')} />
                <Segment
                  label="Pending"
                  value={counts.pending}
                  color={colors.accent}
                  active={filter === 'pending'}
                  onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
                />
                <Segment
                  label="Completed"
                  value={counts.completed}
                  color={colors.success}
                  active={filter === 'completed'}
                  onPress={() => setFilter(filter === 'completed' ? 'all' : 'completed')}
                />
                <Segment
                  label="Missed"
                  value={counts.missed}
                  color={colors.danger}
                  active={filter === 'missed'}
                  onPress={() => setFilter(filter === 'missed' ? 'all' : 'missed')}
                />
              </View>
              <View style={styles.showRateRow}>
                <Text style={styles.showRateVal}>{counts.showRate === null ? '—' : `${counts.showRate}%`}</Text>
                <View>
                  <Text style={styles.segmentLabel}>Show rate</Text>
                  <Text style={styles.showRateSub}>
                    {counts.showed + counts.noShow
                      ? `${counts.showed} showed · ${counts.noShow} no-show`
                      : 'No outcomes set yet'}
                    {counts.unknown > 0 ? ` · ${counts.unknown} unknown` : ''}
                  </Text>
                </View>
              </View>
            </View>
            {appts.error ? <Text style={styles.errorBanner}>{appts.error}</Text> : null}
          </>
        }
        ListEmptyComponent={
          !appts.loading ? (
            <Text style={styles.empty}>
              {filter === 'all' ? 'No appointments yet. Tap "+ New" to book one.' : 'No appointments with this status.'}
            </Text>
          ) : null
        }
        renderSectionHeader={({ section }) => {
          const rel = relativeDay(section.key);
          return (
            <View style={styles.groupHeader}>
              <Text style={styles.groupDate}>{dayHeading(section.key)}</Text>
              {rel ? (
                <View style={[styles.groupRel, rel === 'Today' && styles.groupToday]}>
                  <Text style={[styles.groupRelText, rel === 'Today' && { color: colors.accent }]}>{rel}</Text>
                </View>
              ) : null}
              <Text style={styles.groupCount}>{section.data.length}</Text>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <AppointmentCard
            appointment={item}
            agentName={agentNameById[item.user_id]}
            variant="full"
            resolving={resolvingId === item.id}
            onDone={() => appts.completeAppt(item.id, 'uncertain')}
            onMiss={() => appts.missAppt(item.id)}
            onDelete={() => appts.deleteAppt(item.id)}
            onResolveOpen={() => setResolvingId(item.id)}
            onResolve={(s) => {
              appts.completeAppt(item.id, s);
              setResolvingId(null);
            }}
            onResolveCancel={() => setResolvingId(null)}
          />
        )}
      />

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 20 + insets.bottom }]}>
            <ScrollView>
              <Text style={styles.modalTitle}>New Appointment</Text>

              <Text style={styles.label}>Title</Text>
              <TextInput style={styles.input} placeholder="e.g. Follow-up call" placeholderTextColor={colors.textDim} value={title} onChangeText={setTitle} />

              <Text style={styles.label}>Project / Client Name</Text>
              {projectField.mode === 'dropdown' ? (
                <Dropdown
                  value={projectName}
                  onChange={setProjectName}
                  placeholder="— None —"
                  options={projectField.options.map((o) => ({ value: o.value, label: o.value }))}
                />
              ) : (
                <TextInput style={styles.input} placeholder="e.g. Insurance Lead" placeholderTextColor={colors.textDim} value={projectName} onChangeText={setProjectName} />
              )}

              <Text style={styles.label}>Description (optional)</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline placeholder="Notes or context..." placeholderTextColor={colors.textDim} value={description} onChangeText={setDescription} />

              <Text style={styles.label}>Date &amp; Time</Text>
              <TouchableOpacity style={styles.input} onPress={() => setShowPicker('date')}>
                <Text style={styles.value}>{when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              </TouchableOpacity>
              {showPicker && (
                <DateTimePicker
                  value={when}
                  mode={showPicker}
                  is24Hour={false}
                  onValueChange={(_, selected) => {
                    if (Platform.OS === 'android') setShowPicker(null);
                    if (showPicker === 'date') {
                      const next = new Date(when);
                      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                      setWhen(next);
                      if (Platform.OS === 'android') setShowPicker('time');
                    } else {
                      const next = new Date(when);
                      next.setHours(selected.getHours(), selected.getMinutes());
                      setWhen(next);
                    }
                  }}
                  onDismiss={() => setShowPicker(null)}
                />
              )}

              <Text style={styles.label}>Account</Text>
              {accountField.mode === 'dropdown' ? (
                <Dropdown
                  value={accountName}
                  onChange={setAccountName}
                  placeholder="— None —"
                  options={accountField.options.map((o) => ({ value: o.value, label: o.value }))}
                />
              ) : (
                <TextInput style={styles.input} placeholder="e.g. Upwork - Client X" placeholderTextColor={colors.textDim} value={accountName} onChangeText={setAccountName} />
              )}

              <Text style={styles.label}>Agent</Text>
              {agentNameField.mode === 'text' ? (
                <TextInput
                  style={styles.input}
                  placeholder={`Agent name (blank = ${user?.name || 'me'})`}
                  placeholderTextColor={colors.textDim}
                  value={agentText}
                  onChangeText={setAgentText}
                />
              ) : (
                <Dropdown
                  value={assignedUserId}
                  onChange={setAssignedUserId}
                  options={buildAgentOptions(assigneeOptions, agentNameField.options.map((o) => o.value), user?.id)}
                />
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setModalOpen(false)}>
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate}>
                  <Text style={styles.primaryBtnText}>Save Appointment</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Segment({
  label,
  value,
  color,
  active,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.segment, active && styles.segmentActive]} onPress={onPress}>
      <Text style={[styles.segmentValue, { color }]}>{value}</Text>
      <Text style={styles.segmentLabel}>{label}</Text>
      <View style={[styles.segmentBar, { backgroundColor: color, opacity: active ? 1 : 0 }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg0 },
  addBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#1a0d00', fontWeight: '700', fontSize: 13 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, fontSize: 14 },
  list: { padding: 16, paddingTop: 0, paddingBottom: TAB_BAR_CLEARANCE, gap: 10 },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  segment: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  segmentActive: { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
  segmentValue: { fontSize: 20, fontWeight: '700' },
  segmentLabel: { fontSize: 11, color: colors.textDim, marginTop: 1 },
  segmentBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  showRateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  showRateVal: { fontSize: 20, fontWeight: '700', color: colors.accent2 },
  showRateSub: { fontSize: 11, color: colors.textDim, opacity: 0.8 },
  errorBanner: {
    color: colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg2,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  groupDate: { color: colors.text, fontSize: 13, fontWeight: '700' },
  groupRel: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  groupToday: { borderColor: 'rgba(255, 122, 24, 0.4)', backgroundColor: 'rgba(255, 122, 24, 0.08)' },
  groupRelText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  groupCount: { marginLeft: 'auto', color: colors.textDim, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bg1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textDim, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 },
  value: { color: colors.text, fontSize: 15 },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  ghostBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  primaryBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.accent },
  primaryBtnText: { color: '#1a0d00', fontWeight: '700', fontSize: 13 },
});
