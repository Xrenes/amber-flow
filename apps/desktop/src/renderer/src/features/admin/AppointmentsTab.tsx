import React, { useState } from 'react';
import type { AdminData } from './useAdminData';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
}

type ApptFilter = 'all' | 'pending' | 'completed' | 'missed';

const FILTERS: { key: ApptFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Missed' },
];

// Ports admin.js's renderAppts(): appointments grouped by date (desc),
// filterable by status pill.
export default function AppointmentsTab({ data }: Props) {
  const [filter, setFilter] = useState<ApptFilter>('all');
  const { appointments, profileMap } = data;

  const filtered = filter === 'all' ? appointments : appointments.filter((a) => a.status === filter);

  const byDate: Record<string, typeof appointments> = {};
  filtered.forEach((a) => {
    const d = a.scheduled_time ? a.scheduled_time.slice(0, 10) : 'Unknown';
    (byDate[d] = byDate[d] || []).push(a);
  });
  const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <div className={styles.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`${styles.chip} ${filter === f.key ? styles.active : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Project</th>
              <th>Title</th>
              <th>Scheduled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>
                  No {filter === 'all' ? '' : `${filter} `}appointments in this range.
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
              return (
                <React.Fragment key={d}>
                  <tr className={styles.dateGroupRow}>
                    <td colSpan={5}>{label}</td>
                  </tr>
                  {byDate[d].map((a) => {
                    const agent = profileMap[a.user_id]?.name || 'Unknown';
                    const time = a.scheduled_time
                      ? new Date(a.scheduled_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : '—';
                    const st = a.status || 'pending';
                    return (
                      <tr key={a.id}>
                        <td>
                          <strong>{agent}</strong>
                        </td>
                        <td>{a.project_name || ''}</td>
                        <td>{a.title || ''}</td>
                        <td>{time}</td>
                        <td>
                          <span className={styles.statusBadge}>{st}</span>
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
