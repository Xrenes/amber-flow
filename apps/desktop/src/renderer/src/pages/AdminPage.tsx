import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAdminData } from '../features/admin/useAdminData';
import OverviewTab from '../features/admin/OverviewTab';
import AttendanceTab from '../features/admin/AttendanceTab';
import AppointmentsTab from '../features/admin/AppointmentsTab';
import TasksTab from '../features/admin/TasksTab';
import TimeLogTab from '../features/admin/TimeLogTab';
import ActivityTab from '../features/admin/ActivityTab';
import MyWorkTab from '../features/admin/MyWorkTab';
import EvaluationsTab from '../features/admin/EvaluationsTab';
import AccountRequestsTab from '../features/admin/AccountRequestsTab';
import TaskFieldsTab from '../features/admin/TaskFieldsTab';
import PluginStoreTab from '../features/admin/PluginStoreTab';
import ProductivityReportsTab from '../features/admin/ProductivityReportsTab';
import { listAccountRequests } from '@amber-flow/shared';
import { usePlugins } from '../features/plugins/usePlugins';
import { useCall } from '../features/calls/useCall';
import CallOverlay from '../features/calls/CallOverlay';
import logo from '../assets/logo.png';
import styles from './AdminPage.module.css';

type TabKey =
  | 'overview'
  | 'attendance'
  | 'appointments'
  | 'tasks'
  | 'timelog'
  | 'activity'
  | 'mywork'
  | 'evaluations'
  | 'taskfields'
  | 'accountrequests'
  | 'plugins'
  | 'reports';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

interface SectionDef {
  label: string;
  tabs: TabDef[];
}

const ICONS = {
  overview: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  attendance: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  appointments: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  timelog: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  mywork: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  evaluations: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
    </svg>
  ),
  accountrequests: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" /><line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  ),
  taskfields: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  ),
  plugins: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><circle cx="17.5" cy="17.5" r="3.5" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.1-3-3L3 17.3" />
    </svg>
  ),
};

// Ports admin.html/admin.js's data + adds a sidebar structure grouping the
// (now 12) tabs into CRM/ERM-style sections: Overview, Operations, People,
// Insights, Settings. Route-level role guard (admin/manager only) lives in App.tsx.
export default function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, live, dateRange, setDateRange, refresh } = useAdminData();
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [pendingRequests, setPendingRequests] = React.useState<number | null>(null);
  const { isEnabled } = usePlugins();
  const call = useCall(user?.id, user?.name || 'Admin');

  const SECTIONS: SectionDef[] = [
    { label: 'Dashboard', tabs: [{ key: 'overview', label: 'Overview', icon: ICONS.overview }] },
    {
      label: 'Operations',
      tabs: [
        { key: 'attendance', label: 'Attendance', icon: ICONS.attendance },
        { key: 'appointments', label: 'Appointments', icon: ICONS.appointments },
        { key: 'tasks', label: 'Tasks', icon: ICONS.tasks },
        { key: 'timelog', label: 'Time Log', icon: ICONS.timelog },
      ],
    },
    {
      label: 'People',
      tabs: [
        { key: 'mywork', label: 'My Work', icon: ICONS.mywork },
        { key: 'evaluations', label: 'Evaluations', icon: ICONS.evaluations },
        { key: 'accountrequests', label: 'Account Requests', icon: ICONS.accountrequests },
      ],
    },
    {
      label: 'Insights',
      tabs: [
        { key: 'activity', label: 'Activity', icon: ICONS.activity },
        ...(isEnabled('productivity-reports')
          ? [{ key: 'reports' as const, label: 'Productivity Reports', icon: ICONS.reports }]
          : []),
      ],
    },
    {
      label: 'Settings',
      tabs: [
        { key: 'taskfields', label: 'Task Fields', icon: ICONS.taskfields },
        { key: 'plugins', label: 'Plugin Store', icon: ICONS.plugins },
      ],
    },
  ];

  const { profiles, appointments, sessions } = data;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => s.start_time?.slice(0, 10) === todayStr);
  const todayAppts = appointments.filter((a) => a.scheduled_time?.slice(0, 10) === todayStr);
  const todayHours = (todaySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / 3600).toFixed(1);
  const todayDone = todayAppts.filter((a) => a.status === 'completed').length;
  const withOutcome = appointments.filter((a) => a.show_status);
  const showRate = withOutcome.length
    ? Math.round((withOutcome.filter((a) => a.show_status === 'showed').length / withOutcome.length) * 100)
    : null;

  React.useEffect(() => {
    listAccountRequests().then(({ data: reqs }) => {
      if (reqs) setPendingRequests(reqs.filter((r) => r.status === 'pending').length);
    });
  }, [tab]);

  const activeTabLabel = SECTIONS.flatMap((s) => s.tabs).find((t) => t.key === tab)?.label || 'Overview';

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img src={logo} alt="Amber logo" className={styles.logoImg} />
          <div>
            <h1>Amber Flow</h1>
            <p className={styles.tagline}>Admin Panel</p>
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
          {SECTIONS.map((section) => (
            <div key={section.label} className={styles.sidebarSection}>
              <div className={styles.sidebarSectionLabel}>{section.label}</div>
              {section.tabs.map((t) => (
                <button
                  key={t.key}
                  className={`${styles.sidebarTab} ${tab === t.key ? styles.active : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.icon}
                  {t.label}
                  {t.key === 'accountrequests' && !!pendingRequests && (
                    <span className={styles.sidebarBadge}>{pendingRequests}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <div className={styles.pageTitle}>{activeTabLabel}</div>
            <div className={styles.headerRight}>
              <input
                type="date"
                className={styles.dateInput}
                value={dateRange.from}
                onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
              />
              <span className={styles.dateSep}>→</span>
              <input
                type="date"
                className={styles.dateInput}
                value={dateRange.to}
                onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
              />
              <button className={styles.ghostBtn} onClick={() => refresh()}>
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Refresh
              </button>
              {live && <span className={styles.rtLiveDot} title="Real-time updates active" />}
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiVal}>{loading ? '—' : profiles.length}</div>
              <div className={styles.kpiLabel}>Total Agents</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={`${styles.kpiVal} ${styles.accent}`}>{loading ? '—' : `${todayHours}h`}</div>
              <div className={styles.kpiLabel}>Hours Today</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiVal}>{loading ? '—' : todayAppts.length}</div>
              <div className={styles.kpiLabel}>Appts Today</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={`${styles.kpiVal} ${styles.success}`}>{loading ? '—' : todayDone}</div>
              <div className={styles.kpiLabel}>Completed Today</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={`${styles.kpiVal} ${showRate !== null ? styles.accent : ''}`}>
                {showRate === null ? '—' : `${showRate}%`}
              </div>
              <div className={styles.kpiLabel}>Show Rate</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={`${styles.kpiVal} ${pendingRequests ? styles.accent : ''}`}>
                {pendingRequests === null ? '—' : pendingRequests}
              </div>
              <div className={styles.kpiLabel}>Pending Requests</div>
            </div>
          </div>

          {tab === 'overview' && <OverviewTab data={data} onCall={call.startCall} />}
          {tab === 'attendance' && <AttendanceTab data={data} />}
          {tab === 'appointments' && <AppointmentsTab data={data} />}
          {tab === 'tasks' && <TasksTab data={data} />}
          {tab === 'timelog' && <TimeLogTab data={data} />}
          {tab === 'activity' && <ActivityTab data={data} />}
          {tab === 'mywork' && user && <MyWorkTab data={data} userId={user.id} />}
          {tab === 'evaluations' && <EvaluationsTab data={data} />}
          {tab === 'taskfields' && <TaskFieldsTab />}
          {tab === 'accountrequests' && <AccountRequestsTab />}
          {tab === 'plugins' && <PluginStoreTab />}
          {tab === 'reports' && <ProductivityReportsTab data={data} />}
        </div>
      </div>

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
