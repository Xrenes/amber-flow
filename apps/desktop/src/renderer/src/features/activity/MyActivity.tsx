import React, { useEffect, useMemo, useState } from 'react';
import { listActivityLogsByUser, subscribeToActivityLogs, getSupabase } from '@amber-flow/shared';
import type { ActivityLog } from '@amber-flow/shared';
import { isDemoMode, demoActivityLogs } from '../../demo/demoData';
import { groupActivityByDay, fmtClock, localDayKey } from './activityStats';
import { ACTION_TO_KIND, labelFor } from '../admin/useAgentTimeline';
import { TIMELINE_ICONS, timelineKindTone } from '../admin/timelineIcons';
import appt from '../admin/AppointmentsTab.module.css';
import shared from '../admin/AdminShared.module.css';
import styles from './MyActivity.module.css';

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
}

function fmtIdle(sec: number): string {
  if (sec < 60) return sec > 0 ? '<1m' : '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function relLabel(date: string): string {
  const today = localDayKey(new Date().toISOString());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (date === today) return 'Today';
  if (date === localDayKey(y.toISOString())) return 'Yesterday';
  return '';
}

const HIDDEN_IN_TIMELINE = new Set(['STATUS_ACTIVE']); // noise next to idle/away events

// Agent-facing daily activity: when the tracker started and stopped,
// breaks, idle time (needs the Idle/Active Status plugin), and appointments
// booked / completed / missed — one row per day, click for the full
// timeline. Live: new events land via the activity_logs subscription.
export default function MyActivity({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode()) {
      setLogs(demoActivityLogs.filter((l) => l.user_id === userId));
      setLoading(false);
      return;
    }

    let cancelled = false;
    listActivityLogsByUser(userId).then(({ data }) => {
      if (cancelled) return;
      if (data) setLogs(data as ActivityLog[]);
      setLoading(false);
    });

    const channel = subscribeToActivityLogs(userId, () => {
      listActivityLogsByUser(userId).then(({ data }) => {
        if (data) setLogs(data as ActivityLog[]);
      });
    });

    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, [userId]);

  const days = useMemo(() => groupActivityByDay(logs), [logs]);

  const week = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const cutoff = localDayKey(d.toISOString());
    const recent = days.filter((x) => x.date >= cutoff);
    const worked = recent.filter((x) => x.firstStart);
    return {
      activeDays: worked.length,
      booked: recent.reduce((s, x) => s + x.booked, 0),
      completed: recent.reduce((s, x) => s + x.completed, 0),
      missed: recent.reduce((s, x) => s + x.missed, 0),
      avgIdle: recent.length ? recent.reduce((s, x) => s + x.idleSeconds, 0) / recent.length : 0,
    };
  }, [days]);

  if (loading) return <p className={styles.hint}>Loading activity…</p>;
  if (!days.length) {
    return (
      <div className={styles.emptyState}>
        <h3>No activity yet</h3>
        <p>Start the Time Tracker or book an appointment, and your day will show up here.</p>
      </div>
    );
  }

  const today = days.find((d) => d.date === localDayKey(new Date().toISOString()));

  return (
    <div className={styles.wrap}>
      <div className={`${appt.summary} ${styles.summary}`}>
        <div className={appt.showRate}>
          <span className={`${appt.segmentValue} ${styles.accent}`}>{today?.firstStart ? fmtTime(today.firstStart) : '—'}</span>
          <span className={appt.segmentLabel}>Started today</span>
          <span className={appt.showRateSub}>{today?.breaks ? `${today.breaks} break${today.breaks > 1 ? 's' : ''}` : 'No breaks yet'}</span>
        </div>
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{week.activeDays}/7</span>
          <span className={appt.segmentLabel}>Days active</span>
          <span className={appt.showRateSub}>Last 7 days</span>
        </div>
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{week.booked}</span>
          <span className={appt.segmentLabel}>Booked</span>
          <span className={appt.showRateSub}>Last 7 days</span>
        </div>
        <div className={appt.showRate}>
          <span className={`${appt.segmentValue} ${styles.good}`}>{week.completed}</span>
          <span className={appt.segmentLabel}>Completed</span>
          <span className={appt.showRateSub}>{week.missed ? `${week.missed} missed` : 'None missed'}</span>
        </div>
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{fmtIdle(week.avgIdle)}</span>
          <span className={appt.segmentLabel}>Avg. idle per day</span>
          <span className={appt.showRateSub}>Needs Idle/Active Status on</span>
        </div>
      </div>

      <div className={`${shared.tableWrap} ${appt.wrap}`}>
        <table className={`${shared.table} ${appt.table}`}>
          <thead>
            <tr>
              <th>Day</th>
              <th>Started</th>
              <th>Stopped</th>
              <th>Breaks</th>
              <th>Idle</th>
              <th>Appointments</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const open = openDate === d.date;
              const rel = relLabel(d.date);
              const events = d.logs.filter((l) => !HIDDEN_IN_TIMELINE.has(l.action_type));
              return (
                <React.Fragment key={d.date}>
                  <tr className={`${appt.row} ${open ? styles.rowOpen : ''}`} onClick={() => setOpenDate(open ? null : d.date)}>
                    <td>
                      <div className={styles.dayCell}>
                        <svg
                          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                        <span className={styles.dayName}>
                          {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {rel && <span className={`${appt.groupRel} ${rel === 'Today' ? appt.groupToday : ''}`}>{rel}</span>}
                      </div>
                    </td>
                    <td className={styles.num}>{fmtTime(d.firstStart)}</td>
                    <td className={styles.num}>{fmtTime(d.lastStop)}</td>
                    <td className={styles.num}>{d.breaks || <span className={appt.muted}>—</span>}</td>
                    <td className={styles.num} title={fmtClock(d.idleSeconds)}>
                      {d.idleSeconds ? fmtIdle(d.idleSeconds) : <span className={appt.muted}>—</span>}
                    </td>
                    <td>
                      <div className={styles.apptChips}>
                        <span className={styles.chipNeutral} title="Booked">
                          {d.booked} booked
                        </span>
                        {d.completed > 0 && <span className={styles.chipGood}>{d.completed} done</span>}
                        {d.missed > 0 && <span className={styles.chipBad}>{d.missed} missed</span>}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className={styles.detailRow}>
                      <td colSpan={6}>
                        <ol className={styles.timeline}>
                          {[...events].reverse().map((log, i) => {
                            const kind = ACTION_TO_KIND[log.action_type] || 'status';
                            const isFirstLogin =
                              log.action_type === 'START_TRACKER' && log.created_at === d.firstStart;
                            const { label, detail } = labelFor(log, isFirstLogin);
                            const tone = timelineKindTone(isFirstLogin ? 'login' : kind);
                            return (
                              <li key={log.id || i} className={styles.event}>
                                <span className={styles.eventTime}>{fmtTime(log.created_at || null)}</span>
                                <span className={`${styles.eventNode} ${styles[`tone_${tone}`]}`}>
                                  {TIMELINE_ICONS[isFirstLogin ? 'login' : kind]}
                                </span>
                                <span className={styles.eventBody}>
                                  <span className={styles.eventLabel}>{label}</span>
                                  {detail && <span className={styles.eventDetail}>{detail}</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
