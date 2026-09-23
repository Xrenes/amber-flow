import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAdminData } from '../features/admin/useAdminData';
import OverviewTab from '../features/admin/OverviewTab';
import AppointmentsTab from '../features/admin/AppointmentsTab';
import TasksTab from '../features/admin/TasksTab';
import TimeLogTab from '../features/admin/TimeLogTab';
import ActivityTab from '../features/admin/ActivityTab';
import MyWorkTab from '../features/admin/MyWorkTab';
import TaskFieldsTab from '../features/admin/TaskFieldsTab';
import AccountRequestsTab from '../features/admin/AccountRequestsTab';
import PluginStoreTab from '../features/admin/PluginStoreTab';
import ProductivityReportsTab from '../features/admin/ProductivityReportsTab';
import { listAccountRequests } from '@amber-flow/shared';
import { usePlugins } from '../features/plugins/usePlugins';
import logo from '../assets/logo.png';
import styles from './AdminPage.module.css';

type TabKey =
  | 'overview'
  | 'appointments'
  | 'tasks'
  | 'timelog'
  | 'activity'
  | 'mywork'
  | 'taskfields'
  | 'accountrequests'
  | 'plugins'
  | 'reports';

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'timelog', label: 'Time Log' },
  { key: 'activity', label: 'Activity' },
  { key: 'mywork', label: 'My Work' },
  { key: 'taskfields', label: 'Task Fields' },
  { key: 'accountrequests', label: 'Account Requests' },
  { key: 'plugins', label: 'Plugin Store' },
];

// Ports admin.html/admin.js in full: tab bar, date-range filter, KPI row,
// and the six admin tabs, all backed by real Supabase data via useAdminData.
// Route-level role guard (admin/manager only) already lives in App.tsx.
export default function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, live, dateRange, setDateRange, refresh } = useAdminData();
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [pendingRequests, setPendingRequests] = React.useState<number | null>(null);
  const { isEnabled } = usePlugins();

  const TABS = isEnabled('productivity-reports')
    ? [...BASE_TABS, { key: 'reports' as const, label: 'Productivity Reports' }]
    : BASE_TABS;

  const { profiles, appointments, sessions } = data;

  // KPI row (admin.js's kpiAgents/kpiHours/kpiAppts/kpiDone, plus a
  // pending-account-requests count in place of the removed Telegram KPI).
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => s.start_time?.slice(0, 10) === todayStr);
  const todayAppts = appointments.filter((a) => a.scheduled_time?.slice(0, 10) === todayStr);
  const todayHours = (todaySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) / 3600).toFixed(1);
  const todayDone = todayAppts.filter((a) => a.status === 'completed').length;

  React.useEffect(() => {
    listAccountRequests().then(({ data: reqs }) => {
      if (reqs) setPendingRequests(reqs.filter((r) => r.status === 'pending').length);
    });
  }, [tab]);

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />

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

      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <div className={styles.pageTitle}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Admin Panel
          </div>
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
            <div className={`${styles.kpiVal} ${pendingRequests ? styles.accent : ''}`}>
              {pendingRequests === null ? '—' : pendingRequests}
            </div>
            <div className={styles.kpiLabel}>Pending Requests</div>
          </div>
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.active : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'appointments' && <AppointmentsTab data={data} />}
        {tab === 'tasks' && <TasksTab data={data} />}
        {tab === 'timelog' && <TimeLogTab data={data} />}
        {tab === 'activity' && <ActivityTab data={data} />}
        {tab === 'mywork' && user && <MyWorkTab data={data} userId={user.id} />}
        {tab === 'taskfields' && <TaskFieldsTab />}
        {tab === 'accountrequests' && <AccountRequestsTab />}
        {tab === 'plugins' && <PluginStoreTab />}
        {tab === 'reports' && <ProductivityReportsTab data={data} />}
      </div>
    </div>
  );
}
