import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import TimeTracker from '../features/tracker/TimeTracker';
import WorldClocks from '../features/worldclocks/WorldClocks';
import UpcomingAppointments from '../features/appointments/UpcomingAppointments';
import AppointmentStats from '../features/appointments/AppointmentStats';
import { useAppointments } from '../features/appointments/useAppointments';
import { useAlarmScheduler } from '../features/alarm/useAlarmScheduler';
import AlarmOverlay from '../features/alarm/AlarmOverlay';
import SettingsModal from '../features/settings/SettingsModal';
import ProfileMenu from '../components/ProfileMenu';
import { usePlugins } from '../features/plugins/usePlugins';
import { useIdleStatus } from '../features/plugins/useIdleStatus';
import PresenceIndicator from '../features/plugins/PresenceIndicator';
import MobileCheckInQr from '../features/plugins/MobileCheckInQr';
import { useCall } from '../features/calls/useCall';
import CallOverlay from '../features/calls/CallOverlay';
import logo from '../assets/logo.png';
import styles from './MainPage.module.css';

// Composes the ported feature set into the single-page main app (index.html's
// topbar + tracker + appointments + world clocks), replacing the legacy
// multi-page window.location.href navigation with in-page modals. Tasks were
// removed from the app entirely — Appointments (created directly from Home
// now) are the only schedulable item across desktop, mobile, and Admin.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function MainPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const appts = useAppointments(user?.id);
  const alarm = useAlarmScheduler({ appointments: appts.appointments });

  const [settingsOpen, setSettingsOpen] = useState(false);

  const { isEnabled } = usePlugins();
  const idleStatus = useIdleStatus(user?.id, isEnabled('idle-status'));

  const call = useCall(user?.id, user?.name || 'User');

  return (
    <div className={styles.page}>
      <div className="bg-glow" />

      <header className={styles.topbarWrap}>
      <div className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <img src={logo} alt="Amber logo" className={styles.logoImg} />
          </div>
          <div>
            <h1>Amber Flow</h1>
            <p className={styles.tagline}>Never miss a follow-up</p>
          </div>
        </div>
        <div className={styles.topActions}>
          {idleStatus && <PresenceIndicator status={idleStatus} />}
          <button className={styles.ghostBtn} title="My Reports" onClick={() => navigate('/reports')}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Reports
          </button>
          {(user?.role === 'admin' || user?.role === 'manager') && (
            <button className={styles.ghostBtn} title="Go to Admin Panel" onClick={() => navigate('/admin')}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Admin
            </button>
          )}
          <ProfileMenu name={user?.name || 'User'} onSettings={() => setSettingsOpen(true)} onSignOut={() => signOut()} />
        </div>
      </div>
      </header>

      <main className={styles.container}>
        <div className={styles.greeting}>
          <h2 className={styles.greetingTitle}>
            {greeting()}, {(user?.name || 'there').split(' ')[0]}
          </h2>
          <p className={styles.greetingDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <AppointmentStats appointments={appts.appointments} />

        <MobileCheckInQr userId={user?.id} enabled={isEnabled('mobile-qr-checkin')} />

        <TimeTracker />

        <section className={styles.section}>
          <WorldClocks />
        </section>

        <UpcomingAppointments
          appointments={appts.appointments}
          currentUserId={user?.id || ''}
          currentUserName={user?.name || ''}
          onCreate={appts.createAppointment}
          onUpdate={appts.updateAppointment}
          onComplete={appts.completeAppt}
          onReopen={appts.reopenAppt}
          onMiss={appts.missAppt}
          onDelete={appts.deleteAppt}
          error={appts.error}
        />
      </main>

      {alarm.alarm && (
        <AlarmOverlay
          item={alarm.alarm.item}
          kind={alarm.alarm.kind}
          labelKind={alarm.alarm.labelKind}
          onDismiss={alarm.dismiss}
          onSnooze={() => alarm.snooze()}
        />
      )}

      {settingsOpen && <SettingsModal displayName={user?.name} onClose={() => setSettingsOpen(false)} />}

      <CallOverlay
        state={call.state}
        remoteName={call.remoteName}
        incomingFromName={call.incomingCall?.fromName}
        error={call.error}
        onAnswer={call.answerCall}
        onDecline={call.declineCall}
        onEnd={call.endCall}
        audioRef={call.remoteAudioRef}
      />
    </div>
  );
}
