import React, { useEffect, useMemo, useState } from 'react';
import {
  listAgentGoals,
  subscribeToAgentGoals,
  agentNamesForGoals,
  computeAgentNameAttainmentRow,
  periodRange,
  getSupabase,
} from '@amber-flow/shared';
import type { AgentGoal, Appointment, TimeSession, PeriodKey } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';
import { useTaskFieldOptions } from '../appointments/useTaskFieldOptions';
import styles from './MyGoalsTab.module.css';

interface Props {
  userId: string;
  userName: string;
  // Everyone's appointments and sessions — goals count by agent name, the
  // same attribution Reports uses, so any login sees the same numbers.
  appointments: Appointment[];
  sessions: TimeSession[];
  profileNames: Record<string, string>;
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
};

const DEMO_GOALS: AgentGoal[] = [
  { id: 'demo-global', user_id: null, agent_name: null, campaign_name: null, daily_appointment_goal: 3, daily_show_goal: 2 },
];

// Local calendar day (toISOString would give the UTC date).
function todayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRange(r: { start: Date; end: Date }): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${r.start.toLocaleDateString('en-US', opts)} – ${r.end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// Agent-facing view of the same goal/attainment numbers the Admin Panel's
// Goal Attainment tab shows for the whole team (see
// packages/shared/src/goalAttainment.ts) — scoped to just this signed-in
// agent's own appointments/sessions, which My Reports already has loaded,
// so no admin-only bulk query is needed here.
export default function MyGoalsTab({ userId, userName, appointments, sessions, profileNames }: Props) {
  const agentField = useTaskFieldOptions('agent');
  const [agent, setAgent] = useState(userName);
  const [reportDateStr, setReportDateStr] = useState(() => todayStr(new Date()));
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [goals, setGoals] = useState<AgentGoal[]>(isDemoMode() ? DEMO_GOALS : []);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) {
      setGoals(DEMO_GOALS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    function refresh() {
      listAgentGoals().then(({ data: rows }) => {
        if (cancelled) return;
        if (rows) setGoals(rows as AgentGoal[]);
        setLoading(false);
      });
    }
    refresh();
    const channel = subscribeToAgentGoals(refresh);
    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, []);

  const reportDate = useMemo(() => new Date(`${reportDateStr}T12:00:00`), [reportDateStr]);
  const range = useMemo(() => periodRange(period, reportDate), [period, reportDate]);
  const agentNames = useMemo(
    () => agentNamesForGoals([userName, ...agentField.options.map((o) => o.value)], appointments, sessions, profileNames),
    [userName, agentField.options, appointments, sessions, profileNames]
  );
  const isMe = agent.trim().toLowerCase() === userName.trim().toLowerCase();
  const row = useMemo(() => {
    // Per-agent goal overrides belong to the login with this name, if any.
    const login = isMe
      ? userId
      : Object.keys(profileNames).find((id) => profileNames[id].trim().toLowerCase() === agent.trim().toLowerCase());
    return computeAgentNameAttainmentRow(agent, appointments, sessions, goals, range, profileNames, login ?? null);
  }, [agent, isMe, userId, appointments, sessions, goals, range, profileNames]);

  if (loading) return <p className={styles.hint}>Loading goals…</p>;

  // The goal is (daily goal × active days: tracked time or a booking), so no active days
  // means a zero goal even when a daily goal exists.
  const noTracked = row.activeDays === 0;
  const noGoal = noTracked || (row.calcAppointmentGoal === 0 && row.calcShowGoal === 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.periodChips}>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.chip} ${period === p ? styles.chipActive : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <label className={styles.dateField}>
          <span>Agent</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {agentNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.dateField}>
          <span>Starting</span>
          <input type="date" value={reportDateStr} onChange={(e) => setReportDateStr(e.target.value)} />
        </label>
      </div>

      {/* ── Status banner ── */}
      <div className={`${styles.banner} ${noGoal ? styles.bannerNeutral : row.meetsGoal ? styles.bannerGood : styles.bannerBelow}`}>
        <div className={styles.bannerIcon}>
          {noGoal ? '—' : row.meetsGoal ? (
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          )}
        </div>
        <div>
          <div className={styles.bannerTitle}>
            {noTracked
              ? 'No activity in this period yet'
              : noGoal
                ? `No goal set for ${isMe ? 'you' : agent} yet`
                : row.meetsGoal
                  ? isMe
                    ? 'You’re meeting your goal'
                    : `${agent} is meeting the goal`
                  : 'Below goal so far'}
          </div>
          <div className={styles.bannerSub}>
            {PERIOD_LABELS[period]} · {fmtRange(range)}
            {noTracked
              ? ' · A day counts once the agent tracks time or books an appointment.'
              : noGoal && ' · Your manager sets goals in the Admin Panel.'}
          </div>
        </div>
      </div>

      {/* ── Two goal rings ── */}
      <div className={styles.rings}>
        <GoalRing
          label="Appointments"
          value={row.appointments}
          goal={row.calcAppointmentGoal}
          pct={row.appAttainmentPct}
          perDay={row.avgAppsPerDay}
        />
        <GoalRing label="Shows" value={row.shows} goal={row.calcShowGoal} pct={row.showAttainmentPct} perDay={row.avgShowsPerDay} />
      </div>

      {/* ── Supporting numbers ── */}
      <div className={styles.metrics}>
        <Metric label="Show rate" value={`${Math.round(row.showRatePct)}%`} hint="Shows out of appointments" />
        <Metric label="Active days" value={String(row.activeDays)} hint="Days with tracked time or a booked appointment" />
        <Metric label="Hours worked" value={`${row.hours.toFixed(1)}h`} hint="Finished Time Tracker sessions" />
      </div>
    </div>
  );
}

function GoalRing({ label, value, goal, pct, perDay }: { label: string; value: number; goal: number; pct: number; perDay: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const tone = goal === 0 ? 'neutral' : pct >= 100 ? 'good' : pct >= 60 ? 'mid' : 'low';
  return (
    <div className={`${styles.ringCard} ${styles[`tone_${tone}`]}`}>
      <div className={styles.ring} style={{ ['--pct' as string]: `${clamped}` }}>
        <div className={styles.ringInner}>
          <span className={styles.ringPct}>{goal ? `${Math.round(pct)}%` : '—'}</span>
          <span className={styles.ringSub}>of goal</span>
        </div>
      </div>
      <div className={styles.ringText}>
        <div className={styles.ringLabel}>{label}</div>
        <div className={styles.ringValue}>
          {value}
          <span className={styles.ringGoal}> / {goal || '—'}</span>
        </div>
        <div className={styles.ringMeta}>{perDay.toFixed(1)} per active day</div>
        {goal > value && <div className={styles.ringLeft}>{goal - value} more to reach the goal</div>}
        {goal > 0 && value >= goal && <div className={styles.ringDone}>Goal reached</div>}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={styles.metric} title={hint}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricHint}>{hint}</span>
    </div>
  );
}
