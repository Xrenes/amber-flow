import React, { useMemo } from 'react';
import type { AdminData } from './useAdminData';
import sharedStyles from './AdminShared.module.css';
import styles from './AttendanceTab.module.css';

interface Props {
  data: AdminData;
}

interface DayRecord {
  date: string; // YYYY-MM-DD
  firstIn: string; // ISO
  lastOut: string | null; // ISO
  totalSeconds: number;
  sessionCount: number;
}

const EXPECTED_START_HOUR = 9; // used only to flag "late" clock-ins, adjust as needed

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

// Attendance derived entirely from the Time Tracker's session history — no
// separate clock-in mechanism. A day counts as "present" for an agent if
// they have at least one time_sessions row starting that day; first
// clock-in = earliest session start, last clock-out = latest session end.
export default function AttendanceTab({ data }: Props) {
  const { profiles, sessions } = data;

  const byAgent = useMemo(() => {
    const map: Record<string, Record<string, DayRecord>> = {};
    sessions.forEach((s) => {
      if (!s.start_time) return;
      const day = s.start_time.slice(0, 10);
      map[s.user_id] ||= {};
      const rec = map[s.user_id][day];
      const endTime = s.end_time || s.start_time;
      if (!rec) {
        map[s.user_id][day] = {
          date: day,
          firstIn: s.start_time,
          lastOut: s.end_time,
          totalSeconds: s.duration_seconds || 0,
          sessionCount: 1,
        };
      } else {
        rec.firstIn = new Date(s.start_time) < new Date(rec.firstIn) ? s.start_time : rec.firstIn;
        rec.lastOut = !rec.lastOut || new Date(endTime) > new Date(rec.lastOut) ? endTime : rec.lastOut;
        rec.totalSeconds += s.duration_seconds || 0;
        rec.sessionCount += 1;
      }
    });
    return map;
  }, [sessions]);

  const todayStr = new Date().toISOString().slice(0, 10);

  if (!profiles.length) {
    return <p className={sharedStyles.feedPlaceholder}>No agents found yet.</p>;
  }

  return (
    <div>
      <p className={styles.hint}>
        Attendance is derived from Time Tracker activity — a day counts as present once an agent
        starts a tracked session.
      </p>

      <h3 className={styles.sectionHeading}>Today</h3>
      <div className={sharedStyles.tableWrap}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>First In</th>
              <th>Last Activity</th>
              <th>Total Today</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const rec = byAgent[p.id]?.[todayStr];
              const isLate = rec && new Date(rec.firstIn).getHours() >= EXPECTED_START_HOUR + 1;
              return (
                <tr key={p.id}>
                  <td>{p.name || 'Unknown'}</td>
                  <td>
                    {rec ? (
                      <span className={`${styles.statusPill} ${styles.present}`}>Present</span>
                    ) : (
                      <span className={`${styles.statusPill} ${styles.absent}`}>Not clocked in</span>
                    )}
                    {isLate && <span className={styles.lateTag}>Late</span>}
                  </td>
                  <td>{rec ? fmtTime(rec.firstIn) : '—'}</td>
                  <td>{rec?.lastOut ? fmtTime(rec.lastOut) : rec ? 'In progress' : '—'}</td>
                  <td>{rec ? fmtDuration(rec.totalSeconds) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className={styles.sectionHeading}>Recent Days</h3>
      <div className={sharedStyles.tableWrap}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Date</th>
              <th>First In</th>
              <th>Last Out</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {profiles.flatMap((p) => {
              const days = Object.values(byAgent[p.id] || {})
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 7);
              return days.map((d) => (
                <tr key={`${p.id}-${d.date}`}>
                  <td>{p.name || 'Unknown'}</td>
                  <td>{d.date}</td>
                  <td>{fmtTime(d.firstIn)}</td>
                  <td>{d.lastOut ? fmtTime(d.lastOut) : 'In progress'}</td>
                  <td>{fmtDuration(d.totalSeconds)}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
