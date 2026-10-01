import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../features/settings/SettingsContext';
import Dropdown from '../components/Dropdown';
import TopBar from '../components/TopBar';
import { TAB_BAR_CLEARANCE } from '../theme/layout';
import { colors } from '../theme/colors';

const REMINDER_OPTIONS = [
  { value: '0', label: 'No reminder' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
];

const TONE_OPTIONS = [
  { value: 'default', label: 'Default beep' },
  { value: 'gentle', label: 'Gentle chime' },
  { value: 'urgent', label: 'Urgent pulse' },
];

// Mirrors the desktop Settings modal's sections (Profile / Tasks /
// Notifications / Alarm Sound), adapted for mobile: no browser-notifications
// toggle (not a mobile concept) and no custom-audio-file upload or live tone
// preview (no audio playback wired up yet) — tone/volume still save and will
// drive actual alarm notifications once those are built.
export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { settings, update } = useSettings();

  const [name, setName] = useState(settings.displayName || user?.name || '');
  const [defaultReminderMins, setDefaultReminderMins] = useState(settings.defaultReminderMins ?? 60);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled !== false);
  const [alarmTone, setAlarmTone] = useState(settings.alarmTone || 'default');
  const [alarmVolume, setAlarmVolume] = useState(settings.alarmVolume ?? 80);

  const initials = (user?.name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function handleSave() {
    update({
      displayName: name.trim(),
      defaultReminderMins,
      soundEnabled,
      alarmTone,
      alarmVolume,
    });
  }

  return (
    <View style={styles.page}>
      <TopBar title="Settings" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{user?.name || 'Agent'}</Text>
            {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
            {user?.role ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{user.role}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.textDim}
            maxLength={40}
            value={name}
            onChangeText={setName}
          />
        </View>

        <Text style={styles.sectionTitle}>Tasks</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Default reminder</Text>
          <Dropdown
            value={String(defaultReminderMins)}
            onChange={(v) => setDefaultReminderMins(Number(v))}
            options={REMINDER_OPTIONS}
          />
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Alarm sound</Text>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Alarm Sound</Text>
        <View style={styles.section}>
          <Text style={styles.label}>Tone</Text>
          <Dropdown value={alarmTone} onChange={(v) => setAlarmTone(v as typeof alarmTone)} options={TONE_OPTIONS} />

          <Text style={[styles.label, { marginTop: 16 }]}>Volume — {alarmVolume}%</Text>
          <View style={styles.volumeRow}>
            <Feather name="volume-1" size={16} color={colors.textDim} />
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={alarmVolume}
              onValueChange={setAlarmVolume}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.accent}
            />
            <Feather name="volume-2" size={16} color={colors.textDim} />
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Feather name="log-out" size={16} color={colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg0 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: TAB_BAR_CLEARANCE },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 20,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#1a0d00', fontWeight: '800', fontSize: 20 },
  profileInfo: { flex: 1 },
  userName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  email: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 122, 24, 0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  roleBadgeText: { color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 18,
    marginBottom: 8,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  slider: { flex: 1, height: 36 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#1a0d00', fontWeight: '700', fontSize: 15 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 14,
    marginTop: 12,
  },
  signOutText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
