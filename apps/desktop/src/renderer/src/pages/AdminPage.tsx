import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAdminData } from '../features/admin/useAdminData';
import OverviewTab from '../features/admin/OverviewTab';
import AttendanceTab from '../features/admin/AttendanceTab';
import AppointmentsTab from '../features/admin/AppointmentsTab';
import AccountRequestsTab from '../features/admin/AccountRequestsTab';
import TaskFieldsTab from '../features/admin/TaskFieldsTab';
import DataImportExportTab from '../features/admin/DataImportExportTab';
import PluginStoreTab from '../features/admin/PluginStoreTab';
import ProductivityReportsTab from '../features/admin/ProductivityReportsTab';
import GoalAttainmentTab from '../features/admin/GoalAttainmentTab';
import OpenSheetTab from '../features/admin/OpenSheetTab';
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
  | 'taskfields'
  | 'accountrequests'
  | 'plugins'
  | 'reports'
  | 'goals'
  | 'dataio'
  | 'opensheet';

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
  goals: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
    </svg>
  ),
  dataio: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  opensheet: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    </svg>
  ),
};

// Ports admin.html/admin.js's data + adds a sidebar structure grouping the
// tabs into CRM/ERM-style sections: Overview, Operations, People, Insights,
// Settings. Route-level role guard (admin/manager only) lives in App.tsx.
// Tasks were removed app-wide — Appointments (bookable directly from every
// agent's Home dashboard) is the single source of truth admins see here.
export default function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, live, refresh } = useAdminData();
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [pendingRequests, setPendingRequests] = React.useState<number | null>(null);
  // Single instance for the whole Admin Panel — a second usePlugins() call
  // elsewhere (OverviewTab, PluginStoreTab) throws ("cannot add
  // postgres_changes callbacks ... after subscribe()") since Overview is
  // the default tab and mounts at the same time as AdminPage itself.
  const { plugins, loading: pluginsLoading, toggle: togglePlugin, isEnabled } = usePlugins();
  const call = useCall(user?.id, user?.name || 'Admin');

  const SECTIONS: SectionDef[] = [
    { label: 'Dashboard', tabs: [{ key: 'overview', label: 'Overview', icon: ICONS.overview }] },
    {
      label: 'Operations',
      tabs: [
        { key: 'attendance', label: 'Attendance', icon: ICONS.attendance },
        { key: 'appointments', label: 'Appointments', icon: ICONS.appointments },
      ],
    },
    {
      label: 'People',
      tabs: [{ key: 'accountrequests', label: 'Team Accounts', icon: ICONS.accountrequests }],
    },
    ...(isEnabled('productivity-reports')
      ? [
          {
            label: 'Insights',
            tabs: [{ key: 'reports' as const, label: 'Productivity Reports', icon: ICONS.reports }],
          },
        ]
      : []),
    {
      label: 'Tracking Sheet',
      tabs: [
        { key: 'opensheet', label: 'Open Sheet', icon: ICONS.opensheet },
        { key: 'goals', label: 'Goal Attainment', icon: ICONS.goals },
        { key: 'dataio', label: 'Import / Export', icon: ICONS.dataio },
      ],
    },
    {
      label: 'Settings',
      tabs: [
        { key: 'taskfields', label: 'Field Options', icon: ICONS.taskfields },
        { key: 'plugins', label: 'Plugin Store', icon: ICONS.plugins },
      ],
    },
  ];

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
              <button className={styles.ghostBtn} onClick={() => refresh()}>
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Refresh
              </button>
              {live && (
                <span className={styles.rtLiveDot} title="Changes from agents appear here automatically">
                  Live
                </span>
              )}
            </div>
          </div>

          {tab === 'overview' &&
            (loading && !data.profiles.length ? (
              <p className={styles.loadingNote}>Loading team…</p>
            ) : (
              <OverviewTab
                data={data}
                isEnabled={isEnabled}
                pendingRequests={pendingRequests}
                onNavigate={(t) => setTab(t as TabKey)}
                onCall={call.startCall}
                onListen={call.startListen}
              />
            ))}
          {tab === 'attendance' && <AttendanceTab data={data} />}
          {tab === 'appointments' && <AppointmentsTab data={data} />}
          {tab === 'taskfields' && <TaskFieldsTab />}
          {tab === 'dataio' && <DataImportExportTab data={data} onImported={refresh} />}
          {tab === 'opensheet' && <OpenSheetTab />}
          {tab === 'accountrequests' && <AccountRequestsTab profiles={data.profiles} onProfilesChanged={refresh} />}
          {tab === 'plugins' && (
            <PluginStoreTab
              data={data}
              plugins={plugins}
              loading={pluginsLoading}
              toggle={togglePlugin}
              onOpenReports={isEnabled('productivity-reports') ? () => setTab('reports') : undefined}
            />
          )}
          {tab === 'reports' && <ProductivityReportsTab data={data} />}
          {tab === 'goals' && <GoalAttainmentTab data={data} />}
        </div>
      </div>

      <CallOverlay
        state={call.state}
        remoteName={call.remoteName}
        incomingFromName={call.incomingCall?.fromName}
        error={call.error}
        isListening={call.isListening}
        onAnswer={call.answerCall}
        onDecline={call.declineCall}
        onEnd={call.endCall}
        audioRef={call.remoteAudioRef}
      />
    </div>
  );
}
