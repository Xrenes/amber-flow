import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { resolveLoginQrToken, buildAgentOptions } from '@amber-flow/shared';
import { useAuth } from '../auth/AuthContext';
import { formatMs, formatMsHM, type useTimeTracker } from '../features/tracker/useTimeTracker';
import { useTaskFieldOptions } from '../hooks/useTaskFieldOptions';
import { useTeamDirectory } from '../hooks/useTeamDirectory';
import Dropdown from '../components/Dropdown';
import ArcGauge from '../components/ArcGauge';
import QrScannerModal from '../components/QrScannerModal';
import TopBar from '../components/TopBar';
import { TAB_BAR_CLEARANCE } from '../theme/layout';
import { colors } from '../theme/colors';

interface TrackerScreenProps {
  tracker: ReturnType<typeof useTimeTracker>;
  qrCheckInEnabled: boolean;
}

// Receives `tracker` as a prop rather than calling useTimeTracker itself —
// the hook is lifted to MainTabs so exactly one instance exists across all
// simultaneously-mounted tabs (see RootNavigator.tsx for why).
export default function TrackerScreen({ tracker, qrCheckInEnabled }: TrackerScreenProps) {
  const { user } = useAuth();
  const campaignField = useTaskFieldOptions('campaign');
  const accountField = useTaskFieldOptions('account');
  const agentNameField = useTaskFieldOptions('agent');
  const { members: teamMembers } = useTeamDirectory();

  const [campaign, setCampaign] = useState('');
  const [account, setAccount] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (tracker.buttonState !== 'running') {
      setCampaign(tracker.campaign);
      setAccount(tracker.account);
      setAssignedUserId(tracker.assignedUserId || user?.id || '');
    }
  }, [tracker.buttonState, tracker.campaign, tracker.account, tracker.assignedUserId, user?.id]);

  const assigneeOptions = useMemo(() => {
    if (!user?.id) return teamMembers;
    if (teamMembers.some((m) => m.id === user.id)) return teamMembers;
    return [{ id: user.id, name: user.name }, ...teamMembers];
  }, [teamMembers, user]);

  const fieldsDisabled = tracker.buttonState === 'running';

  function currentAssignment() {
    return { campaign, account, assignedUserId: assignedUserId || user?.id || '' };
  }

  // Handles a scanned desktop check-in QR: resolves the token to its owning
  // user_id (find_login_qr_token() only succeeds if the mobile-authenticated
  // user IS that owner, enforced server-side — see
  // migrations/012_desktop_qr_tracker_login.sql), then drives the same
  // start/pause/resume state machine as the on-screen buttons based on
  // whatever state the tracker is currently in. One QR code, reused for the
  // whole shift, toggling through states rather than only starting once.
  async function handleScan(data: string) {
    setScannerOpen(false);
    const match = data.match(/^amberflow:\/\/checkin\/(.+)$/);
    if (!match) {
      Alert.alert('Not an Amber Flow code', 'That QR code isn’t a valid check-in code.');
      return;
    }
    const token = match[1];
    const ownerId = await resolveLoginQrToken(token);
    if (!ownerId || ownerId !== user?.id) {
      Alert.alert('Check-in failed', 'This QR code doesn’t belong to your account. Scan the one on your own desktop screen.');
      return;
    }
    if (tracker.buttonState === 'idle') {
      const ok = tracker.startTracker(currentAssignment(), 'qr');
      if (!ok) Alert.alert('Set up your session first', 'Choose a Campaign and Account below, then scan again.');
    } else if (tracker.buttonState === 'running') {
      tracker.toggleBreak('qr');
    } else if (tracker.buttonState === 'stopped') {
      tracker.resumeTracker(currentAssignment(), 'qr');
    }
  }

  const today = tracker.goalProgress;
  const goalMs = tracker.goal * 3600000;
  const leftMs = Math.max(0, goalMs - today.totalMs);
  const state: 'working' | 'break' | 'stopped' | 'idle' =
    tracker.buttonState === 'running' ? (tracker.onBreak ? 'break' : 'working') : tracker.buttonState === 'stopped' ? 'stopped' : 'idle';
  const STATE = {
    working: { label: 'Working', color: colors.success, bg: 'rgba(74, 222, 128, 0.12)' },
    break: { label: 'On break', color: colors.accent2, bg: 'rgba(255, 179, 71, 0.12)' },
    stopped: { label: 'Stopped', color: '#93c5fd', bg: 'rgba(147, 197, 253, 0.12)' },
    idle: { label: 'Not started', color: colors.textDim, bg: 'rgba(255, 255, 255, 0.06)' },
  }[state];
  // Gauge fits any phone width: card is (screen − 32 page padding − 32 card padding).
  const gaugeSize = Math.min(200, width - 64);

  return (
    <View style={styles.page}>
      <TopBar
        title="Time Tracker"
        right={
          qrCheckInEnabled ? (
            <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerOpen(true)} accessibilityLabel="Scan check-in QR code">
              <Feather name="maximize" size={16} color={colors.accent} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <QrScannerModal visible={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ── Today ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.statePill, { backgroundColor: STATE.bg }]}>
              <View style={[styles.stateDot, { backgroundColor: STATE.color }]} />
              <Text style={[styles.stateText, { color: STATE.color }]}>{STATE.label}</Text>
            </View>
            <Text style={styles.goalText}>Goal {tracker.goal}h</Text>
          </View>

          <View style={styles.gaugeWrap}>
            <ArcGauge pct={today.pct} size={gaugeSize} strokeWidth={12} centerText={formatMs(today.totalMs)} centerLabel="worked today" />
          </View>

          <View style={styles.miniStats}>
            <View style={styles.miniStat}>
              <Text style={styles.miniValue}>{tracker.displayText}</Text>
              <Text style={styles.miniLabel}>This session</Text>
            </View>
            <View style={styles.miniDivider} />
            <View style={styles.miniStat}>
              <Text style={[styles.miniValue, leftMs === 0 && { color: colors.success }]}>
                {leftMs === 0 ? 'Goal met' : formatMsHM(leftMs)}
              </Text>
              <Text style={styles.miniLabel}>Left to goal</Text>
            </View>
          </View>

          <View style={styles.controls}>
            {tracker.buttonState === 'idle' && (
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => tracker.startTracker(currentAssignment())}>
                <Feather name="play" size={16} color="#1a0d00" />
                <Text style={[styles.btnText, styles.btnPrimaryText]}>Start</Text>
              </TouchableOpacity>
            )}
            {tracker.buttonState === 'running' && (
              <>
                <TouchableOpacity
                  style={[styles.btn, tracker.onBreak ? styles.btnGood : styles.btnWarn]}
                  onPress={() => tracker.toggleBreak()}
                >
                  <Feather name={tracker.onBreak ? 'play' : 'pause'} size={16} color={tracker.onBreak ? colors.success : colors.accent2} />
                  <Text style={[styles.btnText, { color: tracker.onBreak ? colors.success : colors.accent2 }]}>
                    {tracker.onBreak ? 'Resume' : 'Break'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={() => tracker.stopTracker()}>
                  <Feather name="square" size={14} color={colors.danger} />
                  <Text style={[styles.btnText, { color: colors.danger }]}>Stop</Text>
                </TouchableOpacity>
              </>
            )}
            {tracker.buttonState === 'stopped' && (
              <>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => tracker.resumeTracker(currentAssignment())}>
                  <Feather name="rotate-ccw" size={15} color={colors.text} />
                  <Text style={styles.btnText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={tracker.newTrackerSession}>
                  <Feather name="check" size={16} color="#1a0d00" />
                  <Text style={[styles.btnText, styles.btnPrimaryText]}>Save & new</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {tracker.buttonState === 'stopped' && (
            <Text style={styles.hint}>This session is saved to your reports when you tap Save & new.</Text>
          )}
        </View>

        {/* ── Session details ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Session details</Text>
            {fieldsDisabled && (
              <View style={styles.lockNote}>
                <Feather name="lock" size={11} color={colors.textDim} />
                <Text style={styles.lockText}>Locked while running</Text>
              </View>
            )}
          </View>

          <Text style={styles.label}>Agent</Text>
          <Dropdown
            value={assignedUserId}
            disabled={fieldsDisabled}
            onChange={setAssignedUserId}
            options={buildAgentOptions(assigneeOptions, agentNameField.options.map((o) => o.value), user?.id)}
          />

          <Text style={styles.label}>Campaign</Text>
          {campaignField.mode === 'dropdown' ? (
            <Dropdown
              value={campaign}
              disabled={fieldsDisabled}
              onChange={setCampaign}
              placeholder="— Select —"
              options={campaignField.options.map((o) => ({ value: o.value, label: o.value }))}
            />
          ) : (
            <TextInput
              style={[styles.textInput, fieldsDisabled && styles.inputDisabled]}
              placeholder="e.g. Q3 Outreach"
              placeholderTextColor={colors.textDim}
              editable={!fieldsDisabled}
              value={campaign}
              onChangeText={setCampaign}
            />
          )}

          <Text style={styles.label}>Account</Text>
          {accountField.mode === 'dropdown' ? (
            <Dropdown
              value={account}
              disabled={fieldsDisabled}
              onChange={setAccount}
              placeholder="— Select —"
              options={accountField.options.map((o) => ({ value: o.value, label: o.value }))}
            />
          ) : (
            <TextInput
              style={[styles.textInput, fieldsDisabled && styles.inputDisabled]}
              placeholder="e.g. Upwork - Client X"
              placeholderTextColor={colors.textDim}
              editable={!fieldsDisabled}
              value={account}
              onChangeText={setAccount}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg0 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE, gap: 12 },
  scanBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  statePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stateDot: { width: 7, height: 7, borderRadius: 4 },
  stateText: { fontSize: 12, fontWeight: '700' },
  goalText: { fontSize: 12, color: colors.textDim, fontWeight: '600' },
  gaugeWrap: { alignItems: 'center', marginTop: 8 },
  miniStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  miniStat: { flex: 1, alignItems: 'center' },
  miniDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  miniValue: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  miniLabel: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  controls: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#1a0d00' },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border },
  btnWarn: { backgroundColor: 'rgba(255, 179, 71, 0.12)', borderColor: 'rgba(255, 179, 71, 0.35)' },
  btnGood: { backgroundColor: 'rgba(74, 222, 128, 0.12)', borderColor: 'rgba(74, 222, 128, 0.35)' },
  btnDanger: { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)' },
  hint: { fontSize: 11, color: colors.textDim, textAlign: 'center', marginTop: 8 },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 11, color: colors.textDim },
  label: { fontSize: 12, fontWeight: '600', color: colors.textDim, marginBottom: 6, marginTop: 12 },
  textInput: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  inputDisabled: { opacity: 0.5 },
});
