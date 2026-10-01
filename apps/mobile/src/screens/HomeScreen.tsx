import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePendingAppointments } from '../features/appointments/usePendingAppointments';
import WorldClocks from '../components/WorldClocks';
import TopBar from '../components/TopBar';
import AppointmentCard from '../components/AppointmentCard';
import AppointmentSummary from '../components/AppointmentSummary';
import { TAB_BAR_CLEARANCE } from '../theme/layout';
import { colors } from '../theme/colors';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Home — a proper dashboard: greeting, appointment summary strip (same
// numbers as desktop's AppointmentStats), World Clocks, then the pending
// appointments list. Appointment cards use the same shared AppointmentCard
// as the Appointments tab (compact variant: preview only, no action
// buttons), so every field desktop's appointment table shows is visible here too.
export default function HomeScreen() {
  const { user } = useAuth();
  const appts = usePendingAppointments(user?.id);

  const pending = useMemo(
    () =>
      appts.appointments
        .filter((a) => a.status === 'pending')
        .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()),
    [appts.appointments]
  );

  return (
    <View style={styles.page}>
      <TopBar title="Home" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>
            {greeting()}, {(user?.name || 'there').split(' ')[0]}
          </Text>
          <Text style={styles.greetingDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        <AppointmentSummary appointments={appts.appointments} />

        <WorldClocks />

        <Text style={styles.sectionTitle}>Pending Appointments</Text>
        {!appts.loading && pending.length === 0 && (
          <Text style={styles.empty}>No pending appointments.</Text>
        )}
        <View style={styles.cardsCol}>
          {pending.map((a) => (
            <AppointmentCard key={a.id} appointment={a} variant="compact" />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg0 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: TAB_BAR_CLEARANCE },
  greeting: { marginBottom: 16 },
  greetingTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  greetingDate: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  empty: { color: colors.textDim, fontSize: 13, paddingVertical: 12 },
  cardsCol: { gap: 10 },
});
