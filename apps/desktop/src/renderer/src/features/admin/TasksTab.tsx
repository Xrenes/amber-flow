import React, { useMemo, useState } from 'react';
import type { AdminData } from './useAdminData';
import type { Task } from '@amber-flow/shared';
import type { LeadStatus } from '@amber-flow/shared';
import AdminToolbar from './AdminToolbar';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
}

type TaskFilter = 'all' | 'S' | 'NS' | 'C' | 'done';
type SortKey = 'date-desc' | 'date-asc' | 'agent';

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'all', label: 'All statuses' },
  { key: 'S', label: 'S — Started' },
  { key: 'NS', label: 'NS — Not Started' },
  { key: 'C', label: 'C — Completed' },
  { key: 'done', label: 'Done' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date-desc', label: 'Newest first' },
  { key: 'date-asc', label: 'Oldest first' },
  { key: 'agent', label: 'Agent name' },
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

// Ports admin.js's renderTasks(): filterable, sorted task table with
// lead-status (S/NS/C) and task-status (Done/Overdue/Pending) badges, plus a
// search box and sort control above it.
export default function TasksTab({ data }: Props) {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [search, setSearch] = useState('');
  const { tasks, profileMap } = data;
  const now = new Date();

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filter === 'done') {
      list = list.filter((t) => t.completed);
    } else if (filter === 'S' || filter === 'NS' || filter === 'C') {
      list = list.filter((t) => getLeadBadge(t, now) === filter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const agent = (profileMap[t.user_id]?.name || '').toLowerCase();
        return (t.title || '').toLowerCase().includes(q) || agent.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sort === 'agent') {
        const na = profileMap[a.user_id]?.name || '';
        const nb = profileMap[b.user_id]?.name || '';
        return na.localeCompare(nb);
      }
      const da = `${a.date}T${a.time}`;
      const db = `${b.date}T${b.time}`;
      return sort === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, sort, search, profileMap]);

  return (
    <div>
      <AdminToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search tasks or agent..."
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={(v) => setSort(v as SortKey)}
        filterOptions={FILTERS}
        filterValue={filter}
        onFilterChange={(v) => setFilter(v as TaskFilter)}
      />
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
                  No tasks found.
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
