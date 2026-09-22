import React, { useMemo, useState } from 'react';
import type { LeadStatus, Task, UpsertTaskInput } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import { useTasks } from './useTasks';
import DashboardStats from './DashboardStats';
import TaskModal from './TaskModal';
import styles from './TaskList.module.css';

type FilterState = 'pending' | 'done' | 'all';

// --- Helpers ported from app.js --------------------------------------

// Resolves a task's date+time into a real Date, honoring its saved IANA
// timezone the same way app.js's taskDateTime() does (wall-clock in that tz).
function taskDateTime(t: Task): Date {
  const tz = t.timezone;
  if (tz) {
    try {
      const probe = new Date(`${t.date}T${t.time}:00Z`); // treat as UTC first
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = fmt.formatToParts(probe);
      const p: Record<string, string> = {};
      parts.forEach(({ type, value }) => {
        p[type] = value;
      });
      const tzLocal = new Date(
        `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`
      );
      const offsetMs = tzLocal.getTime() - probe.getTime();
      return new Date(probe.getTime() - offsetMs);
    } catch {
      /* fall through */
    }
  }
  return new Date(`${t.date}T${t.time}`);
}

function fmtDateTimeForTask(task: Task): string {
  const d = taskDateTime(task);
  return d.toLocaleString(undefined, {
    timeZone: task.timezone || undefined,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeUntil(d: Date): string {
  const ms = d.getTime() - Date.now();
  if (ms < 0) return 'Overdue';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`;
  const days = Math.floor(h / 24);
  return `in ${days}d`;
}

function formatReminder(mins: number): string {
  if (mins === 0) return 'At time';
  if (mins < 60) return `${mins}m before`;
  if (mins < 1440) return `${mins / 60}h before`;
  return `${mins / 1440}d before`;
}

// Cycles null -> S -> NS -> C -> null, matching app.js's leadstatus button.
function cycleLeadStatus(current: LeadStatus | null): LeadStatus | null {
  const cycle: Record<string, LeadStatus | null> = { none: 'S', S: 'NS', NS: 'C', C: null };
  return cycle[current || 'none'] ?? null;
}

function leadTagClass(ls: LeadStatus | null): string {
  if (ls === 'S') return styles.lsS;
  if (ls === 'NS') return styles.lsNS;
  if (ls === 'C') return styles.lsC;
  return styles.lsNone;
}

const ICONS = {
  check: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  empty: (
    <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
};

interface TaskListProps {
  // Lets a parent (e.g. MainPage's alarm scheduler) observe the live task
  // list without this component's Supabase subscription being duplicated.
  onTasksChange?: (tasks: Task[]) => void;
}

// Ports app.js's render() (filtering/sorting), modal open/close wiring, and
// the toggle/leadstatus/delete task-list click handlers.
export default function TaskList({ onTasksChange }: TaskListProps = {}) {
  const { user } = useAuth();
  const { tasks, addOrUpdateTask, removeTask, loading } = useTasks(user?.id);

  React.useEffect(() => {
    onTasksChange?.(tasks);
  }, [tasks, onTasksChange]);

  const [filter, setFilter] = useState<FilterState>('pending');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const visibleTasks = useMemo(() => {
    let list = [...tasks];
    if (filter === 'pending') list = list.filter((t) => !t.completed);
    else if (filter === 'done') list = list.filter((t) => t.completed);
    list.sort((a, b) => taskDateTime(a).getTime() - taskDateTime(b).getTime());
    return list;
  }, [tasks, filter]);

  function openAddModal() {
    setEditingTask(null);
    setModalOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTask(null);
  }

  function handleSave(data: UpsertTaskInput) {
    addOrUpdateTask(data);
  }

  function handleToggle(task: Task) {
    addOrUpdateTask({ ...toUpsertInput(task), completed: !task.completed });
  }

  function handleLeadStatus(task: Task) {
    addOrUpdateTask({ ...toUpsertInput(task), lead_status: cycleLeadStatus(task.lead_status) });
  }

  function handleDelete(task: Task) {
    if (window.confirm(`Delete task "${task.title}"?`)) {
      removeTask(task.id);
    }
  }

  // Toggling an already-active filter chip reverts to 'all' (app.js behavior).
  function handleFilterClick(next: 'pending' | 'done') {
    setFilter((prev) => (prev === next ? 'all' : next));
  }

  return (
    <>
      <DashboardStats tasks={tasks} />

      <section className={styles.actionRow}>
        <h2 className={styles.sectionTitle}>
          {ICONS.chevron} Upcoming Tasks
        </h2>
        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.chip} ${filter === 'pending' ? styles.active : ''}`}
            onClick={() => handleFilterClick('pending')}
          >
            Pending
          </button>
          <button
            type="button"
            className={`${styles.chip} ${filter === 'done' ? styles.active : ''}`}
            onClick={() => handleFilterClick('done')}
          >
            Completed
          </button>
          <button type="button" className={styles.primaryBtn} onClick={openAddModal}>
            {ICONS.plus} Add Task
          </button>
        </div>
      </section>

      {!loading && visibleTasks.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>{ICONS.empty}</div>
          <h3>No tasks yet</h3>
          <p>Click &quot;Add Task&quot; to schedule your first reminder.</p>
        </div>
      )}

      {visibleTasks.length > 0 && (
        <section className={styles.taskList}>
          {visibleTasks.map((t) => {
            const dt = taskDateTime(t);
            const now = Date.now();
            const overdue = !t.completed && dt.getTime() < now;
            const soon = !t.completed && !overdue && dt.getTime() - now < 60 * 60000;
            const ls = t.lead_status || null;
            const lsLabel = ls || '·';

            const classNames = [
              styles.task,
              t.completed ? styles.done : '',
              overdue ? styles.overdue : '',
              soon ? styles.soon : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={t.id} className={classNames}>
                <button
                  type="button"
                  className={`${styles.leadTag} ${leadTagClass(ls)}`}
                  title={`Lead status: ${ls || 'Not set'} — click to change`}
                  onClick={() => handleLeadStatus(t)}
                >
                  {lsLabel}
                </button>
                <button type="button" className={styles.check} title="Toggle complete" onClick={() => handleToggle(t)}>
                  {t.completed ? ICONS.check : null}
                </button>
                <div className={styles.taskBody} title="Double-click to edit" onDoubleClick={() => openEditModal(t)}>
                  <div className={styles.taskTitle}>{t.title}</div>
                  <div className={styles.taskMeta}>
                    <span className={styles.metaItem}>
                      {ICONS.calendar} {fmtDateTimeForTask(t)}
                    </span>
                    {t.completed ? (
                      <span className={`${styles.badge} ${styles.success}`}>Done</span>
                    ) : overdue ? (
                      <span className={`${styles.badge} ${styles.danger}`}>Overdue</span>
                    ) : (
                      <span className={styles.badge}>{timeUntil(dt)}</span>
                    )}
                    {t.reminder_minutes > 0 && !t.completed && (
                      <span className={styles.metaItem}>
                        {ICONS.bell} {formatReminder(t.reminder_minutes)}
                      </span>
                    )}
                    {t.timezone && (
                      <span className={styles.apptTzBadge}>{t.timezone.split('/').pop()?.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  {t.description && <div className={styles.taskDesc}>{t.description}</div>}
                </div>
                <div className={styles.taskActions}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete"
                    onClick={() => handleDelete(t)}
                  >
                    {ICONS.trash}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {modalOpen && user && (
        <TaskModal userId={user.id} task={editingTask} onClose={closeModal} onSave={handleSave} />
      )}
    </>
  );
}

function toUpsertInput(task: Task): UpsertTaskInput {
  return {
    id: task.id,
    user_id: task.user_id,
    title: task.title,
    description: task.description,
    date: task.date,
    time: task.time,
    reminder_minutes: task.reminder_minutes,
    completed: task.completed,
    lead_status: task.lead_status,
    timezone: task.timezone,
  };
}
