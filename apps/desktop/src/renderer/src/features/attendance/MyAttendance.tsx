import React, { useEffect, useMemo, useState } from 'react';
import { listTimeSessionsByUser } from '@amber-flow/shared';
import type { TimeSession } from '@amber-flow/shared';
import { isDemoMode, demoSessions } from '../../demo/demoData';
import styles from './MyAttendance.module.css';

interface DayRecord {
  date: string;
  firstIn: string;
  lastOut: string | null;
  totalSeconds: number;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
function fmtDayLabel(date: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Agent-facing attendance panel — derived from the same Time Tracker
// session history the admin's Attendance tab reads, scoped to this user.
// Lives as a tab panel in the agent's "Reports" page (MyReportsPage).
export default function MyAttendance({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (isDemoMode()) {
        setSessions(demoSessions);
        setLoading(false);
        return;
      }
      const { data } = await listTimeSessionsByUser(userId);
      if (data) setSessions(data);
      setLoading(false);
    }
    load();
  }, [userId]);

  const days = useMemo(() => {
    const map: Record<string, DayRecord> = {};
    sessions.forEach((s) => {
      if (!s.start_time) return;
      const day = s.start_time.slice(0, 10);
      const endTime = s.end_time || s.start_time;
      if (!map[day]) {
        map[day] = { date: day, firstIn: s.start_time, lastOut: s.end_time, totalSeconds: s.duration_seconds || 0 };
      } else {
        const rec = map[day];
        rec.firstIn = new Date(s.start_time) < new Date(rec.firstIn) ? s.start_time : rec.firstIn;
        rec.lastOut = !rec.lastOut || new Date(endTime) > new Date(rec.lastOut) ? endTime : rec.lastOut;
        rec.totalSeconds += s.duration_seconds || 0;
      }
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = days.find((d) => d.date === todayStr);
  const history = days.filter((d) => d.date !== todayStr);

  if (loading) return <p className={styles.hint}>Loading…</p>;

  return (
    <div>
      <div className={styles.todayCard}>
        <span className={styles.todayLabel}>Today</span>
        {today ? (
          <>
            <span className={`${styles.pill} ${styles.present}`}>Clocked in</span>
            <span className={styles.todayDetail}>
              In {fmtTime(today.firstIn)} · {today.lastOut ? `Out ${fmtTime(today.lastOut)}` : 'Still active'} ·{' '}
              {fmtDuration(today.totalSeconds)}
            </span>
          </>
        ) : (
          <span className={`${styles.pill} ${styles.absent}`}>Not clocked in yet</span>
        )}
      </div>

      {history.length > 0 ? (
        <ul className={styles.list}>
          {history.map((d) => (
            <li key={d.date} className={styles.item}>
              <span className={styles.itemDate}>{fmtDayLabel(d.date)}</span>
              <span className={styles.itemDetail}>
                {fmtTime(d.firstIn)} – {d.lastOut ? fmtTime(d.lastOut) : '—'}
              </span>
              <span className={styles.itemTotal}>{fmtDuration(d.totalSeconds)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>No previous attendance recorded yet.</p>
      )}
    </div>
  );
}
