import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '@amber-flow/shared';
import { useAuth } from '../auth/AuthContext';
import TaskList from '../features/tasks/TaskList';
import DashboardStats from '../features/tasks/DashboardStats';
import TimeTracker from '../features/tracker/TimeTracker';
import WorldClocks from '../features/worldclocks/WorldClocks';
import AppointmentList from '../features/appointments/AppointmentList';
import { useAppointments } from '../features/appointments/useAppointments';
import { useAlarmScheduler } from '../features/alarm/useAlarmScheduler';
import AlarmOverlay from '../features/alarm/AlarmOverlay';
import TelegramIndicatorButton from '../features/telegram/TelegramIndicatorButton';
import TelegramSettingsModal from '../features/telegram/TelegramSettingsModal';
import { useTelegram } from '../features/telegram/useTelegram';
import SettingsModal from '../features/settings/SettingsModal';
import OnboardingFlow from '../features/onboarding/OnboardingFlow';
import logo from '../assets/logo.png';
import styles from './MainPage.module.css';

// Composes the ported feature set into the single-page main app (index.html's
// topbar + dashboard + tracker + appointments + world clocks), replacing the
// legacy multi-page window.location.href navigation with in-page modals.
export default function MainPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [tasksSnapshot, setTasksSnapshot] = useState<Task[]>([]);
  const appts = useAppointments(user?.id);
  const alarm = useAlarmScheduler({ tasks: tasksSnapshot, appointments: appts.appointments });

  const { isConnected: tgConnected } = useTelegram(user?.id);
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className={styles.page}>
      <div className="bg-glow" />

      <header className={styles.topbar}>
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
          <div className={styles.userAvatar} title={`Signed in as ${user?.name}`}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </div>
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
          <TelegramIndicatorButton userId={user?.id} onClick={() => setTgModalOpen(true)} />
          {/* Temporary dev aid: fires the real alarm overlay/sound/notification/
              window-focus path on demand, without waiting for a real due task.
              Remove once the alarm system has been manually verified. */}
          <button
            className={styles.ghostBtn}
            title="Fire a test alarm"
            onClick={() =>
              alarm.trigger(
                { id: 'test-alarm', title: 'Test Alarm', description: 'This is a test — minimize the window to verify it comes back to focus.' },
                'task',
                'due'
              )
            }
          >
            🔔 Test Alarm
          </button>
          <button className={styles.ghostBtn} title="Settings" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className={styles.ghostBtn} title="Sign out" onClick={() => signOut()}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <main className={styles.container}>
        <DashboardStats tasks={tasksSnapshot} />

        <TimeTracker />

        <section className={styles.section}>
          <WorldClocks />
        </section>

        <TaskList onTasksChange={setTasksSnapshot} />

        <section className={styles.section}>
          <AppointmentList
            appointments={appts.appointments}
            onCreate={appts.createAppointment}
            onUpdate={appts.updateAppointment}
            onComplete={appts.completeAppt}
            onMiss={appts.missAppt}
            onDelete={appts.deleteAppt}
          />
        </section>
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

      {tgModalOpen && <TelegramSettingsModal userId={user?.id} onClose={() => setTgModalOpen(false)} />}
      {settingsOpen && <SettingsModal displayName={user?.name} onClose={() => setSettingsOpen(false)} />}

      <OnboardingFlow userId={user?.id} isTGConnected={tgConnected} onFinish={() => setTgModalOpen(false)} />
    </div>
  );
}
