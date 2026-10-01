import React, { useEffect, useMemo, useState } from 'react';
import type { AdminData } from './useAdminData';
import sharedStyles from './AdminShared.module.css';
import appt from './AppointmentsTab.module.css';
import styles from './AttendanceTab.module.css';
import { initials, relativeDay } from '../appointments/apptFormat';
import { buildAttendance, dayKey, fmtClock, fmtDuration, isLate, TARGET_SECONDS, type DayRecord } from './attendanceCalc';

interface Props {
  data: AdminData;
}

type TodayFilter = 'all' | 'working' | 'present' | 'absent' | 'late';

const HISTORY_DAYS = 30;
const WEEK_DAYS = 7;

const fmtTime = fmtClock;

function fmtDayHeading(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtHours(sec: number) {
  return `${(sec / 3600).toFixed(1)}h`;
}

// Attendance derived entirely from the Time Tracker's session history — no
// separate clock-in mechanism. A day counts as "present" for an agent once
// they start a tracked session; first in = earliest session start, last
// activity = latest session end, "working now" = a session still running.
export default function AttendanceTab({ data }: Props) {
  const { profiles, sessions, logs } = data;
  const [filter, setFilter] = useState<TodayFilter>('all');

  // Re-render every minute so running sessions' totals and "Working now" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayStr = dayKey(new Date(now));

  const byAgent = useMemo(() => buildAttendance(sessions, logs, now), [sessions, logs, now]);

  const profileName = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => {
      map[p.id] = p.name || 'Unknown';
    });
    return map;
  }, [profiles]);

  // ── Today ──
  const today = useMemo(() => {
    const rows = profiles.map((p) => {
      const rec = byAgent[p.id]?.[todayStr];
      const late = isLate(rec);
      return { id: p.id, name: p.name || 'Unknown', role: p.role, rec, late };
    });
    // Working first, then present (earliest in first), then absent by name.
    rows.sort((a, b) => {
      const rank = (r: typeof a) => (r.rec?.working ? 0 : r.rec ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.rec && b.rec) return new Date(a.rec.firstIn).getTime() - new Date(b.rec.firstIn).getTime();
      return a.name.localeCompare(b.name);
    });
    const present = rows.filter((r) => r.rec);
    const avgStartMins = present.length
      ? Math.round(
          present.reduce((sum, r) => {
            const d = new Date(r.rec!.firstIn);
            return sum + d.getHours() * 60 + d.getMinutes();
          }, 0) / present.length
        )
      : null;
    return {
      rows,
      counts: {
        all: rows.length,
        working: rows.filter((r) => r.rec?.working).length,
        present: present.length,
        absent: rows.length - present.length,
        late: rows.filter((r) => r.late).length,
      },
      teamSeconds: present.reduce((s, r) => s + r.rec!.totalSeconds, 0),
      avgStart:
        avgStartMins === null
          ? null
          : new Date(2000, 0, 1, Math.floor(avgStartMins / 60), avgStartMins % 60).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            }),
    };
  }, [profiles, byAgent, todayStr]);

  const visibleToday = today.rows.filter((r) => {
    if (filter === 'working') return r.rec?.working;
    if (filter === 'present') return !!r.rec;
    if (filter === 'absent') return !r.rec;
    if (filter === 'late') return r.late;
    return true;
  });

  // ── Last 7 days grid ──
  const weekDays = useMemo(() => {
    const out: string[] = [];
    for (let i = WEEK_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      out.push(dayKey(d));
    }
    return out;
  }, [now]);

  // ── Log (last 30 days, grouped by date) ──
  const cutoff = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - HISTORY_DAYS);
    return dayKey(d);
  }, [now]);

  const logGroups = useMemo(() => {
    const map: Record<string, { userId: string; rec: DayRecord }[]> = {};
    Object.entries(byAgent).forEach(([userId, days]) => {
      Object.values(days).forEach((rec) => {
        if (rec.date < cutoff) return;
        (map[rec.date] ||= []).push({ userId, rec });
      });
    });
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        date,
        entries: map[date].sort((a, b) => new Date(a.rec.firstIn).getTime() - new Date(b.rec.firstIn).getTime()),
      }));
  }, [byAgent, cutoff]);

  if (!profiles.length) {
    return <p className={sharedStyles.feedPlaceholder}>No agents found yet.</p>;
  }

  const segments: { key: TodayFilter; label: string; value: number; tone: string }[] = [
    { key: 'all', label: 'Team', value: today.counts.all, tone: appt.toneAll },
    { key: 'working', label: 'Working now', value: today.counts.working, tone: appt.toneCompleted },
    { key: 'present', label: 'Present today', value: today.counts.present, tone: appt.tonePending },
    { key: 'absent', label: 'Not clocked in', value: today.counts.absent, tone: styles.toneDim },
    { key: 'late', label: 'Late', value: today.counts.late, tone: appt.toneMissed },
  ];

  return (
    <div>
      {/* ── Summary strip ── */}
      <div className={`${appt.summary} ${styles.summary}`}>
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`${appt.segment} ${s.tone} ${filter === s.key ? appt.segmentActive : ''}`}
            onClick={() => setFilter(filter === s.key && s.key !== 'all' ? 'all' : s.key)}
          >
            <span className={appt.segmentValue}>{s.value}</span>
            <span className={appt.segmentLabel}>{s.label}</span>
          </button>
        ))}
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{fmtHours(today.teamSeconds)}</span>
          <span className={appt.segmentLabel}>Team hours today</span>
          <span className={appt.showRateSub}>{today.avgStart ? `Avg. first in ${today.avgStart}` : 'Nobody clocked in yet'}</span>
        </div>
      </div>

      {/* ── Today board ── */}
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Today</h3>
        <span className={styles.sectionMeta}>
          {new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div className={`${sharedStyles.tableWrap} ${appt.wrap}`}>
        <table className={`${sharedStyles.table} ${appt.table}`}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>First in</th>
              <th>Last activity</th>
              <th className={styles.progressCol}>Worked today</th>
            </tr>
          </thead>
          <tbody>
            {!visibleToday.length && (
              <tr>
                <td colSpan={5} className={sharedStyles.tableEmpty}>
                  Nobody matches this filter right now.
                </td>
              </tr>
            )}
            {visibleToday.map(({ id, name, role, rec, late }) => {
              const pct = rec ? Math.min(100, Math.round((rec.totalSeconds / TARGET_SECONDS) * 100)) : 0;
              return (
                <tr key={id}>
                  <td>
                    <div className={appt.agent}>
                      <span className={`${appt.avatar} ${styles.avatarWrap}`}>
                        {initials(name) || '?'}
                        {rec?.working && <span className={styles.liveDot} title="Working now" />}
                      </span>
                      <div>
                        <div className={appt.agentName}>{name}</div>
                        <div className={styles.role}>{role}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={appt.statusCell}>
                      {rec?.working ? (
                        <span className={`${appt.pill} ${appt.pill_completed}`}>
                          <span className={`${appt.dot} ${styles.pulse}`} />
                          Working now
                        </span>
                      ) : rec?.onBreak ? (
                        <span className={`${appt.pill} ${appt.pill_pending}`}>
                          <span className={appt.dot} />
                          On break
                        </span>
                      ) : rec ? (
                        <span className={`${appt.pill} ${styles.pillOut}`}>
                          <span className={appt.dot} />
                          Clocked out
                        </span>
                      ) : (
                        <span className={appt.pill}>
                          <span className={appt.dot} />
                          Not clocked in
                        </span>
                      )}
                      {late && <span className={`${appt.outcome} ${appt.outcomeNoShow}`}>Late</span>}
                    </div>
                  </td>
                  <td className={styles.timeCell}>{rec ? fmtTime(rec.firstIn) : <span className={appt.muted}>—</span>}</td>
                  <td className={styles.timeCell}>
                    {rec?.working ? (
                      <span className={styles.live}>Now</span>
                    ) : rec?.onBreak ? (
                      <span className={styles.onBreak}>On break</span>
                    ) : rec?.lastOut ? (
                      fmtTime(rec.lastOut)
                    ) : (
                      <span className={appt.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.progressCol}>
                    {rec ? (
                      <div className={styles.progress}>
                        <div className={styles.bar}>
                          <div
                            className={`${styles.fill} ${pct >= 100 ? styles.fillFull : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={styles.progressVal}>{fmtDuration(rec.totalSeconds)}</span>
                      </div>
                    ) : (
                      <span className={appt.muted}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Last 7 days ── */}
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Last 7 days</h3>
        <span className={styles.legend}>
          Less
          <span className={`${styles.cell} ${styles.lvl0}`} />
          <span className={`${styles.cell} ${styles.lvl1}`} />
          <span className={`${styles.cell} ${styles.lvl2}`} />
          <span className={`${styles.cell} ${styles.lvl3}`} />
          <span className={`${styles.cell} ${styles.lvl4}`} />
          8h+
        </span>
      </div>
      <div className={`${sharedStyles.tableWrap} ${appt.wrap}`}>
        <table className={`${sharedStyles.table} ${appt.table} ${styles.weekTable}`}>
          <thead>
            <tr>
              <th>Agent</th>
              {weekDays.map((d) => (
                <th key={d} className={`${styles.weekHead} ${d === todayStr ? styles.weekToday : ''}`}>
                  <span>{new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className={styles.weekDate}>{new Date(`${d}T12:00:00`).getDate()}</span>
                </th>
              ))}
              <th className={styles.weekTotalHead}>Days · Hours</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              let days = 0;
              let secs = 0;
              return (
                <tr key={p.id}>
                  <td>
                    <div className={appt.agent}>
                      <span className={appt.avatar}>{initials(p.name || '') || '?'}</span>
                      <span className={appt.agentName}>{p.name || 'Unknown'}</span>
                    </div>
                  </td>
                  {weekDays.map((d) => {
                    const rec = byAgent[p.id]?.[d];
                    if (rec) {
                      days += 1;
                      secs += rec.totalSeconds;
                    }
                    const ratio = rec ? rec.totalSeconds / TARGET_SECONDS : 0;
                    const lvl = !rec ? 0 : ratio >= 1 ? 4 : ratio >= 0.6 ? 3 : ratio >= 0.3 ? 2 : 1;
                    return (
                      <td key={d} className={styles.weekCellTd}>
                        <span
                          className={`${styles.cell} ${styles[`lvl${lvl}`]}`}
                          title={
                            rec
                              ? `${fmtDayHeading(d)} — in ${fmtTime(rec.firstIn)}, ${fmtDuration(rec.totalSeconds)}`
                              : `${fmtDayHeading(d)} — absent`
                          }
                        >
                          {rec ? fmtHours(rec.totalSeconds).replace('.0h', 'h') : ''}
                        </span>
                      </td>
                    );
                  })}
                  <td className={styles.weekTotal}>
                    <strong>{days}</strong>/{WEEK_DAYS} · {fmtHours(secs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Log ── */}
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Attendance log</h3>
        <span className={styles.sectionMeta}>Last {HISTORY_DAYS} days, from Time Tracker sessions</span>
      </div>
      <div className={`${sharedStyles.tableWrap} ${appt.wrap}`}>
        <table className={`${sharedStyles.table} ${appt.table}`}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>First in</th>
              <th>Last out</th>
              <th>Sessions</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {!logGroups.length && (
              <tr>
                <td colSpan={5} className={sharedStyles.tableEmpty}>
                  No attendance recorded yet. It appears here once agents start the Time Tracker.
                </td>
              </tr>
            )}
            {logGroups.map(({ date, entries }) => {
              const rel = relativeDay(date);
              const dayTotal = entries.reduce((s, e) => s + e.rec.totalSeconds, 0);
              return (
                <React.Fragment key={date}>
                  <tr className={appt.groupRow}>
                    <td colSpan={5}>
                      <div className={appt.groupInner}>
                        <span className={appt.groupDate}>{fmtDayHeading(date)}</span>
                        {rel && <span className={`${appt.groupRel} ${rel === 'Today' ? appt.groupToday : ''}`}>{rel}</span>}
                        <span className={appt.groupCount}>
                          {entries.length}/{profiles.length} present · {fmtHours(dayTotal)}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {entries.map(({ userId, rec }) => {
                    const name = profileName[userId] || 'Unknown';
                    const late = isLate(rec);
                    return (
                      <tr key={`${date}-${userId}`}>
                        <td>
                          <div className={appt.agent}>
                            <span className={appt.avatar}>{initials(name) || '?'}</span>
                            <span className={appt.agentName}>{name}</span>
                          </div>
                        </td>
                        <td className={styles.timeCell}>
                          {fmtTime(rec.firstIn)}
                          {late && <span className={styles.lateInline}>Late</span>}
                        </td>
                        <td className={styles.timeCell}>
                          {rec.working ? <span className={styles.live}>Still working</span> : rec.lastOut ? fmtTime(rec.lastOut) : '—'}
                        </td>
                        <td className={styles.timeCell}>{rec.sessionCount}</td>
                        <td className={styles.timeCell}>
                          <strong>{fmtDuration(rec.totalSeconds)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
