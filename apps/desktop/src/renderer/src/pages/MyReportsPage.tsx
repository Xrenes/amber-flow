import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAppointments } from '../features/appointments/useAppointments';
import AppointmentList from '../features/appointments/AppointmentList';
import MyAttendance from '../features/attendance/MyAttendance';
import MyEvaluations from '../features/evaluations/MyEvaluations';
import logo from '../assets/logo.png';
import styles from './MyReportsPage.module.css';

type TabKey = 'appointments' | 'attendance' | 'evaluations';

const ICONS = {
  appointments: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  attendance: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  evaluations: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
    </svg>
  ),
};

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'appointments', label: 'Appointments', icon: ICONS.appointments },
  { key: 'attendance', label: 'Attendance', icon: ICONS.attendance },
  { key: 'evaluations', label: 'Evaluations', icon: ICONS.evaluations },
];

// Agent-facing "Reports" page — appointments (moved off the main dashboard),
// plus the agent's own attendance and shared evaluations — laid out with
// the same sidebar shell as the Admin Panel, scoped to just this user.
export default function MyReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = React.useState<TabKey>('appointments');
  const appts = useAppointments(user?.id);

  const activeLabel = TABS.find((t) => t.key === tab)?.label || 'Appointments';

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
            <div className={styles.pageTitle}>{activeLabel}</div>
          </div>

          {tab === 'appointments' && (
            <AppointmentList
              appointments={appts.appointments}
              onCreate={appts.createAppointment}
              onUpdate={appts.updateAppointment}
              onComplete={appts.completeAppt}
              onMiss={appts.missAppt}
              onDelete={appts.deleteAppt}
            />
          )}
          {tab === 'attendance' && user && <MyAttendance userId={user.id} />}
          {tab === 'evaluations' && user && <MyEvaluations userId={user.id} />}
        </div>
      </div>
    </div>
  );
}
