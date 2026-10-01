import React from 'react';
import type { AdminData } from './useAdminData';
import WorkedTimeReport from '../../components/WorkedTimeReport';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
}

// Ports admin.js's renderTimelog(): time sessions grouped by date (desc)
// with a per-day total, most-recent day first, plus a worked-time-by-account
// breakdown (segmented bar per day) above the raw session table.
export default function TimeLogTab({ data }: Props) {
  const { sessions, profileMap } = data;

  const byDate: Record<string, typeof sessions> = {};
  sessions.forEach((s) => {
    const d = s.start_time ? s.start_time.slice(0, 10) : 'Unknown';
    (byDate[d] = byDate[d] || []).push(s);
  });
  const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <WorkedTimeReport sessions={sessions} />
      <div className={styles.tableWrap} style={{ marginTop: 20 }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Project</th>
            <th>Date</th>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {!sessions.length && (
            <tr>
              <td colSpan={6} className={styles.tableEmpty}>
                No time sessions in this range.
              </td>
            </tr>
          )}
          {dateKeys.map((d) => {
            const label =
              d === 'Unknown'
                ? 'Unknown date'
                : new Date(`${d}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
            const daySec = byDate[d].reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
            const dH = Math.floor(daySec / 3600);
            const dM = Math.floor((daySec % 3600) / 60);
            return (
              <React.Fragment key={d}>
                <tr className={styles.dateGroupRow}>
                  <td colSpan={6}>
                    {label} — <span style={{ opacity: 0.7, fontWeight: 400 }}>total</span> {dH}h {dM}m
                  </td>
                </tr>
                {byDate[d].map((s) => {
                  const agent = profileMap[s.user_id]?.name || 'Unknown';
                  const startT = s.start_time
                    ? new Date(s.start_time).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '—';
                  const endT = s.end_time
                    ? new Date(s.end_time).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '—';
                  const h = Math.floor((s.duration_seconds || 0) / 3600);
                  const m = Math.floor(((s.duration_seconds || 0) % 3600) / 60);
                  const dur = s.duration_seconds ? `${h}h ${m}m` : '—';
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{agent}</strong>
                      </td>
                      <td>{s.project_name || ''}</td>
                      <td>{d}</td>
                      <td>{startT}</td>
                      <td>{endT}</td>
                      <td>
                        <span className={styles.dur}>{dur}</span>
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
