import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAppointments } from '../features/appointments/useAppointments';
import AppointmentList from '../features/appointments/AppointmentList';
import { useReportsAppointments } from '../features/reports/useReportsData';
import MyEvaluations from '../features/evaluations/MyEvaluations';
import MyActivity from '../features/activity/MyActivity';
import MyGoalsTab from '../features/goals/MyGoalsTab';
import WorkedTimeReport from '../components/WorkedTimeReport';
import { listTimeSessionsByUser } from '@amber-flow/shared';
import type { TimeSession } from '@amber-flow/shared';
import { isDemoMode, demoSessions } from '../demo/demoData';
import logo from '../assets/logo.png';
import styles from './MyReportsPage.module.css';

type TabKey = 'appointments' | 'workedtime' | 'activity' | 'evaluations' | 'goals';

const ICONS = {
  appointments: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  workedtime: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  evaluations: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  goals: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
    </svg>
  ),
};

const TABS: { key: TabKey; label: string; icon: React.ReactNode; description: string }[] = [
  {
    key: 'appointments',
    label: 'Appointments',
    icon: ICONS.appointments,
    description: 'Everything you’ve booked, by the date it’s scheduled for.',
  },
  { key: 'goals', label: 'Goals', icon: ICONS.goals, description: 'How you’re tracking against your appointment and show goals.' },
  { key: 'workedtime', label: 'Worked Time', icon: ICONS.workedtime, description: 'Your tracked hours by day and account.' },
  { key: 'activity', label: 'Activity', icon: ICONS.activity, description: 'Your day at a glance: start, breaks, idle time and appointments.' },
  { key: 'evaluations', label: 'Evaluations', icon: ICONS.evaluations, description: 'Reviews your manager has shared with you.' },
];

// Agent-facing "Reports" page — appointments (moved off the main dashboard),
// worked time by account, and shared evaluations — laid out with the same
// sidebar shell as the Admin Panel. The Appointments tab shows everyone's
// appointments by agent name; the other tabs are this user's own.
export default function MyReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('appointments');
  const appts = useAppointments(user?.id);
  // Everyone's appointments, by agent name (the Appointments tab).
  const reportAppts = useReportsAppointments(tab === 'appointments');
  const isManager = user?.role === 'admin' || user?.role === 'manager';
  // After any change, reload the shared list too.
  const andReload =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    async (...args: A) => {
      await fn(...args);
      await reportAppts.refresh();
    };
  const [sessions, setSessions] = useState<TimeSession[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    if (isDemoMode()) {
      setSessions(demoSessions);
      return;
    }
    listTimeSessionsByUser(user.id).then(({ data }) => {
      if (data) setSessions(data);
    });
  }, [user?.id]);

  const active = TABS.find((t) => t.key === tab) || TABS[0];
  const name = user?.name || 'Agent';
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?';

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img src={logo} alt="Amber logo" className={styles.logoImg} />
          <div>
            <h1>Amber Flow</h1>
            <p className={styles.tagline}>My Reports</p>
          </div>
        </div>
        <div className={styles.topActions}>
          <button className={styles.ghostBtn} onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to App
          </button>
        </div>
      </header>

      <div className={styles.shell}>
        <nav className={styles.sidebar}>
          <div className={styles.me}>
            <span className={styles.meAvatar}>{initials}</span>
            <div className={styles.meText}>
              <div className={styles.meName}>{name}</div>
              <div className={styles.meRole}>{user?.role || 'agent'}</div>
            </div>
          </div>
          <div className={styles.sidebarSectionLabel}>Reports</div>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.sidebarTab} ${tab === t.key ? styles.active : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <div className={styles.pageTitle}>{active.label}</div>
            <div className={styles.pageSub}>{active.description}</div>
          </div>

          {tab === 'appointments' && (
            <AppointmentList
              appointments={reportAppts.appointments}
              agentName={user?.name || ''}
              currentUserId={user?.id || ''}
              canModify={(a) => isManager || a.user_id === user?.id}
              onCreate={andReload(appts.createAppointment)}
              onUpdate={andReload(appts.updateAppointment)}
              onComplete={andReload(appts.completeAppt)}
              onMiss={andReload(appts.missAppt)}
              onDelete={andReload(appts.deleteAppt)}
            />
          )}
          {tab === 'goals' && user && (
            <MyGoalsTab userId={user.id} userName={user.name || 'Agent'} appointments={appts.appointments} sessions={sessions} />
          )}
          {tab === 'workedtime' && <WorkedTimeReport sessions={sessions} />}
          {tab === 'activity' && user && <MyActivity userId={user.id} />}
          {tab === 'evaluations' && user && <MyEvaluations userId={user.id} />}
        </div>
      </div>
    </div>
  );
}
