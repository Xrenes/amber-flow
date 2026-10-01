import React, { useEffect, useMemo, useState } from 'react';
import type { AdminData } from './useAdminData';
import type { Profile } from '@amber-flow/shared';
import { usePresenceMap } from '../plugins/usePresenceMap';
import { useAuth } from '../../auth/AuthContext';
import AccountsAgentsPanel from './AccountsAgentsPanel';
import AgentTimelineModal from './AgentTimelineModal';
import AgentActivityFeed from './AgentActivityFeed';
import { apptDayKey, initials } from '../appointments/apptFormat';
import { buildAttendance, dayKey, fmtClock, fmtDuration, isLate, TARGET_SECONDS } from './attendanceCalc';
import shared from './AdminShared.module.css';
import styles from './OverviewTab.module.css';

interface Props {
  data: AdminData;
  isEnabled: (id: string) => boolean;
  pendingRequests: number | null;
  onNavigate: (tab: string) => void;
  onCall?: (agentId: string, agentName: string) => void;
  onListen?: (agentId: string, agentName: string) => void;
}

type SortKey = 'status' | 'name' | 'hours' | 'appts';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'status', label: 'Working first' },
  { key: 'hours', label: 'Most hours today' },
  { key: 'appts', label: 'Most appointments' },
  { key: 'name', label: 'Name' },
];

// Ports admin.js's renderOverview() as a CRM dashboard: today's headline
// numbers (each opens the tab with the detail), then one card per agent
// with live status, today's progress, lifetime totals, actions and recent
// activity. isEnabled comes from AdminPage's single usePlugins() instance
// rather than calling the hook again here — a second instance subscribing
// to the same Realtime channel throws ("cannot add postgres_changes
// callbacks ... after subscribe()") since both are mounted at once.
export default function OverviewTab({ data, isEnabled, pendingRequests, onNavigate, onCall, onListen }: Props) {
  const { profiles, appointments, sessions, logs } = data;
  const { statusFor } = usePresenceMap();
  const { user } = useAuth();
  const presenceOn = isEnabled('idle-status');
  const canCall = user?.role === 'admin' || user?.role === 'manager';
  const [timelineAgent, setTimelineAgent] = useState<Profile | null>(null);
  const [timelineDate, setTimelineDate] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('status');

  // Tick every minute so live hours and "since" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const todayStr = dayKey(new Date(now));

  const attendance = useMemo(() => buildAttendance(sessions, logs, now), [sessions, logs, now]);

  const cards = useMemo(() => {
    return profiles.map((p) => {
      const today = attendance[p.id]?.[todayStr];
      const mine = appointments.filter((a) => a.user_id === p.id);
      const todayAppts = mine.filter((a) => apptDayKey(a) === todayStr);
      const done = mine.filter((a) => a.status === 'completed').length;
      const missed = mine.filter((a) => a.status === 'missed').length;
      const decided = done + missed;
      const totalSec = sessions.filter((s) => s.user_id === p.id).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
      return {
        profile: p,
        name: p.name || 'Unknown',
        today,
        todayAppts: todayAppts.length,
        todayDone: todayAppts.filter((a) => a.status === 'completed').length,
        apptTotal: mine.length,
        done,
        missed,
        doneRate: decided ? Math.round((done / decided) * 100) : null,
        totalSec,
      };
    });
  }, [profiles, attendance, appointments, sessions, todayStr]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? cards.filter((c) => c.name.toLowerCase().includes(q) || (c.profile.role || '').includes(q)) : [...cards];
    const rank = (c: (typeof cards)[number]) => (c.today?.working ? 0 : c.today?.onBreak ? 1 : c.today ? 2 : 3);
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'hours') return (b.today?.totalSeconds || 0) - (a.today?.totalSeconds || 0);
      if (sort === 'appts') return b.todayAppts - a.todayAppts || b.apptTotal - a.apptTotal;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    return list;
  }, [cards, search, sort]);

  if (!profiles.length) {
    return <p className={shared.feedPlaceholder}>No agents found yet.</p>;
  }

  // ── Headline numbers ──
  const onShift = cards.filter((c) => c.today?.working || c.today?.onBreak).length;
  const present = cards.filter((c) => c.today).length;
  const teamSec = cards.reduce((s, c) => s + (c.today?.totalSeconds || 0), 0);
  const apptsToday = appointments.filter((a) => apptDayKey(a) === todayStr);
  const apptsTodayDone = apptsToday.filter((a) => a.status === 'completed').length;
  const showed = appointments.filter((a) => a.show_status === 'showed').length;
  const noShow = appointments.filter((a) => a.show_status === 'no_show').length;
  const showRate = showed + noShow ? Math.round((showed / (showed + noShow)) * 100) : null;

  const kpis: { label: string; value: string; sub: string; tone: string; tab?: string }[] = [
    {
      label: 'On shift now',
      value: `${onShift}/${profiles.length}`,
      sub: `${present} clocked in today`,
      tone: styles.tGreen,
      tab: 'attendance',
    },
    { label: 'Team hours today', value: `${(teamSec / 3600).toFixed(1)}h`, sub: 'Tracked time', tone: styles.tOrange, tab: 'attendance' },
    {
      label: 'Appointments today',
      value: `${apptsTodayDone}/${apptsToday.length}`,
      sub: 'Completed / booked',
      tone: styles.tNeutral,
      tab: 'appointments',
    },
    {
      label: 'Show rate',
      value: showRate === null ? '—' : `${showRate}%`,
      sub: showed + noShow ? `${showed} showed · ${noShow} no-show` : 'No outcomes set yet',
      tone: styles.tOrange,
      tab: 'appointments',
    },
    {
      label: 'Account requests',
      value: pendingRequests === null ? '—' : String(pendingRequests),
      sub: pendingRequests ? 'Waiting for review' : 'All reviewed',
      tone: pendingRequests ? styles.tRed : styles.tNeutral,
      tab: 'accountrequests',
    },
  ];

  function openTimeline(p: Profile, date?: string) {
    setTimelineDate(date);
    setTimelineAgent(p);
  }

  return (
    <>
      <div className={styles.kpis}>
        {kpis.map((k) => (
          <button key={k.label} type="button" className={`${styles.kpi} ${k.tone}`} onClick={() => k.tab && onNavigate(k.tab)}>
            <span className={styles.kpiLabel}>{k.label}</span>
            <span className={styles.kpiValue}>{k.value}</span>
            <span className={styles.kpiSub}>{k.sub}</span>
          </button>
        ))}
      </div>

      <AccountsAgentsPanel profiles={profiles} sessions={sessions} />

      <div className={styles.teamHead}>
        <h3 className={styles.teamTitle}>
          Team <span className={styles.teamCount}>{visible.length}</span>
        </h3>
        <div className={styles.teamTools}>
          <div className={styles.search}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input placeholder="Search agents…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.sortChips}>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`${styles.chip} ${sort === s.key ? styles.chipActive : ''}`}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!visible.length && <p className={shared.feedPlaceholder}>No agents match “{search}”.</p>}

      <div className={styles.grid}>
        {visible.map((c) => {
          const p = c.profile;
          const t = c.today;
          const pct = t ? Math.min(100, Math.round((t.totalSeconds / TARGET_SECONDS) * 100)) : 0;
          const late = isLate(t);
          const state = t?.working ? 'working' : t?.onBreak ? 'break' : t ? 'out' : 'absent';
          const statusText =
            state === 'working'
              ? `Working · since ${fmtClock(t!.firstIn)}`
              : state === 'break'
                ? 'On break'
                : state === 'out'
                  ? t!.lastOut
                    ? `Clocked out at ${fmtClock(t!.lastOut)}`
                    : `Clocked in at ${fmtClock(t!.firstIn)}`
                  : 'Not clocked in today';
          const presence = presenceOn ? statusFor(p.id) : null;

          return (
            <article key={p.id} className={`${styles.card} ${styles[`state_${state}`]}`}>
              <header className={styles.cardHead}>
                <span className={styles.avatar}>
                  {initials(c.name) || '?'}
                  <span className={styles.stateDot} />
                </span>
                <div className={styles.who}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{c.name}</span>
                    <span className={`${shared.roleBadge} ${shared[p.role] || ''}`}>{p.role || 'agent'}</span>
                  </div>
                  <div className={styles.status}>
                    {statusText}
                    {late && <span className={styles.late}>Late</span>}
                    {presence && presence !== 'active' && <span className={styles.presence}>· {presence}</span>}
                  </div>
                </div>
              </header>

              <div className={styles.today}>
                <div className={styles.todayItem}>
                  <div className={styles.todayTop}>
                    <span className={styles.todayLabel}>Today</span>
                    <span className={styles.todayVal}>{t ? fmtDuration(t.totalSeconds) : '0m'}</span>
                  </div>
                  <div className={styles.bar}>
                    <div className={`${styles.fill} ${pct >= 100 ? styles.fillFull : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className={styles.todayItem}>
                  <div className={styles.todayTop}>
                    <span className={styles.todayLabel}>Appointments today</span>
                    <span className={styles.todayVal}>
                      {c.todayDone}/{c.todayAppts}
                    </span>
                  </div>
                  <div className={styles.bar}>
                    <div
                      className={`${styles.fill} ${styles.fillGreen}`}
                      style={{ width: `${c.todayAppts ? Math.round((c.todayDone / c.todayAppts) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.totals}>
                <span title="All time tracked">
                  <strong>{fmtDuration(c.totalSec)}</strong> tracked
                </span>
                <span>
                  <strong>{c.apptTotal}</strong> booked
                </span>
                <span className={styles.good}>
                  <strong>{c.done}</strong> done
                </span>
                {c.missed > 0 && (
                  <span className={styles.bad}>
                    <strong>{c.missed}</strong> missed
                  </span>
                )}
                {c.doneRate !== null && (
                  <span
                    className={c.doneRate >= 80 ? styles.good : c.doneRate >= 50 ? styles.mid : styles.bad}
                    title="Completed out of completed + missed"
                  >
                    <strong>{c.doneRate}%</strong> done rate
                  </span>
                )}
              </div>

              <div className={styles.actions}>
                <button type="button" className={styles.actionBtn} onClick={() => openTimeline(p)}>
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                  Timeline
                </button>
                {canCall && p.id !== user?.id && onCall && (
                  <button type="button" className={`${styles.actionBtn} ${styles.actionCall}`} onClick={() => onCall(p.id, c.name)}>
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    Call
                  </button>
                )}
                {canCall && p.id !== user?.id && onListen && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    title="Listen in without notifying the agent"
                    onClick={() => onListen(p.id, c.name)}
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                    </svg>
                    Listen
                  </button>
                )}
              </div>

              <div className={styles.feed}>
                <div className={styles.feedLabel}>Recent activity</div>
                <AgentActivityFeed userId={p.id} logs={logs} onSelect={(d) => openTimeline(p, d)} />
              </div>
            </article>
          );
        })}
      </div>

      {timelineAgent && (
        <AgentTimelineModal
          profile={timelineAgent}
          logs={logs}
          sessions={sessions}
          initialDate={timelineDate}
          onClose={() => {
            setTimelineAgent(null);
            setTimelineDate(undefined);
          }}
        />
      )}
    </>
  );
}
