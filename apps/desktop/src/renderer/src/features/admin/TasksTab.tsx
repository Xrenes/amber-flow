import React, { useState } from 'react';
import type { AdminData } from './useAdminData';
import type { Task } from '@amber-flow/shared';
import type { LeadStatus } from '@amber-flow/shared';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
}

type TaskFilter = 'all' | 'S' | 'NS' | 'C' | 'done';

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'S', label: 'S — Started' },
  { key: 'NS', label: 'NS — Not Started' },
  { key: 'C', label: 'C — Completed' },
  { key: 'done', label: 'Done' },
];

const LEAD_LABELS: Record<LeadStatus, string> = { S: 'Started', NS: 'Not Started', C: 'Completed' };

// Determine effective lead status for each task (S/NS/C badge). Lead status
// from DB column; fallback: completed=C, else date in past=S, future=NS.
function getLeadBadge(t: Task, now: Date): LeadStatus {
  if (t.lead_status) return t.lead_status;
  if (t.completed) return 'C';
  const dt = new Date(`${t.date}T${t.time}`);
  return dt < now ? 'S' : 'NS';
}

// Ports admin.js's renderTasks(): filterable, sorted-by-date-desc task table
// with lead-status (S/NS/C) and task-status (Done/Overdue/Pending) badges.
export default function TasksTab({ data }: Props) {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const { tasks, profileMap } = data;
  const now = new Date();

  let filtered = [...tasks];
  if (filter === 'done') {
    filtered = filtered.filter((t) => t.completed);
  } else if (filter === 'S' || filter === 'NS' || filter === 'C') {
    filtered = filtered.filter((t) => getLeadBadge(t, now) === filter);
  }

  filtered.sort((a, b) => {
    const da = `${a.date}T${a.time}`;
    const db = `${b.date}T${b.time}`;
    if (da !== db) return db.localeCompare(da);
    const na = profileMap[a.user_id]?.name || '';
    const nb = profileMap[b.user_id]?.name || '';
    return na.localeCompare(nb);
  });

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
              <th>Title</th>
              <th>Scheduled</th>
              <th>Lead Status</th>
              <th>Task Status</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>
                  No tasks found for this filter.
                </td>
              </tr>
            )}
            {filtered.map((t) => {
              const agent = profileMap[t.user_id]?.name || 'Unknown';
              const dt = new Date(`${t.date}T${t.time}`);
              const dtStr = dt.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
              const badge = getLeadBadge(t, now);
              const badgeClass = badge === 'C' ? 'completed' : badge === 'S' ? 'pending' : 'missed';
              const overdue = !t.completed && dt < now;
              const taskStatusLabel = t.completed ? 'Done' : overdue ? 'Overdue' : 'Pending';
              const taskStatusClass = t.completed ? 'completed' : overdue ? 'missed' : 'pending';
              return (
                <tr key={t.id}>
                  <td>
                    <strong>{agent}</strong>
                  </td>
                  <td>{t.title || ''}</td>
                  <td>{dtStr}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${styles[badgeClass]}`}
                      title={LEAD_LABELS[badge] || badge}
                    >
                      {badge}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[taskStatusClass]}`}>{taskStatusLabel}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
