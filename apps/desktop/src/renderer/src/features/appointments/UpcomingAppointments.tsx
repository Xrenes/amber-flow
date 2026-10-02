import React, { useMemo, useState } from 'react';
import type { Appointment, ShowStatus } from '@amber-flow/shared';
import styles from './UpcomingAppointments.module.css';
import { browserTimezone } from './tzUtil';
import { bookedLabel } from './apptFormat';
import AppointmentModal from './AppointmentModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { NewAppointmentInput } from './useAppointments';

interface Props {
  appointments: Appointment[];
  currentUserId: string;
  currentUserName: string;
  onCreate: (input: NewAppointmentInput) => Promise<void> | void;
  onUpdate: (id: string, input: NewAppointmentInput) => Promise<void> | void;
  onComplete: (id: string, showStatus?: ShowStatus) => void;
  onMiss: (id: string) => void;
  onRevert: (id: string) => void;
  onDelete: (id: string) => void;
  error?: string | null;
}

type FilterState = 'pending' | 'done' | 'all';

function fmtDateTime(a: Appointment): string {
  const tz = a.timezone || browserTimezone();
  return new Date(a.scheduled_time).toLocaleString(undefined, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Ports the legacy TaskList row layout for Home's "Upcoming Appointments" —
// a checkbox-row list (Pending/Completed filter chips, checkbox + title +
// meta line + trash) instead of the card grid this replaces, matching how
// the app's Tasks list used to look before Tasks were removed and
// Appointments became the only schedulable item.
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
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  empty: (
    <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

export default function UpcomingAppointments({
  appointments,
  currentUserId,
  currentUserName,
  onCreate,
  onUpdate,
  onComplete,
  onMiss,
  onRevert,
  onDelete,
  error,
}: Props) {
  const [filter, setFilter] = useState<FilterState>('pending');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);

  const visible = useMemo(() => {
    let list = [...appointments];
    if (filter === 'pending') list = list.filter((a) => a.status === 'pending');
    else if (filter === 'done') list = list.filter((a) => a.status === 'completed');
    list.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
    return list;
  }, [appointments, filter]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setModalOpen(true);
  }

  async function handleSave(input: NewAppointmentInput) {
    if (editing) {
      await onUpdate(editing.id, input);
    } else {
      await onCreate(input);
    }
  }

  function handleToggle(a: Appointment) {
    if (a.status === 'completed') {
      onRevert(a.id);
    } else if (a.status === 'pending') {
      onComplete(a.id, 'uncertain');
    }
  }

  function handleDelete(a: Appointment) {
    setDeleting(a);
  }

  function confirmDelete() {
    if (deleting) onDelete(deleting.id);
    setDeleting(null);
  }

  // Toggling an already-active filter chip reverts to 'all', matching the
  // legacy Tasks list's chip behavior.
  function handleFilterClick(next: 'pending' | 'done') {
    setFilter((prev) => (prev === next ? 'all' : next));
  }

  return (
    <>
      <section className={styles.actionRow}>
        <h2 className={styles.sectionTitle}>
          {ICONS.chevron} Upcoming Appointments
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
          <button type="button" className={styles.primaryBtn} onClick={openCreate}>
            {ICONS.plus} Add Appointment
          </button>
        </div>
      </section>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {visible.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>{ICONS.empty}</div>
          <h3>No appointments</h3>
          <p>Click &quot;Add Appointment&quot; to schedule a follow-up.</p>
        </div>
      )}

      {visible.length > 0 && (
        <section className={styles.taskList}>
          {visible.map((a) => {
            const dt = new Date(a.scheduled_time);
            const now = Date.now();
            const completed = a.status === 'completed';
            const missed = a.status === 'missed';
            const overdue = a.status === 'pending' && dt.getTime() < now;
            const soon = a.status === 'pending' && !overdue && dt.getTime() - now < 60 * 60000;

            const classNames = [
              styles.task,
              completed ? styles.done : '',
              overdue || missed ? styles.overdue : '',
              soon ? styles.soon : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={a.id} className={classNames}>
                <button
                  type="button"
                  className={styles.check}
                  title={completed ? 'Click to revert to pending' : 'Mark complete'}
                  onClick={() => handleToggle(a)}
                >
                  {completed ? ICONS.check : null}
                </button>
                <div className={styles.taskBody} title="Double-click to edit" onDoubleClick={() => openEdit(a)}>
                  <div className={styles.taskTitle}>{a.title}</div>
                  <div className={styles.taskMeta}>
                    <span className={styles.metaItem}>
                      {ICONS.calendar} {fmtDateTime(a)}
                    </span>
                    {completed ? (
                      <span className={`${styles.badge} ${styles.success}`}>Done</span>
                    ) : missed ? (
                      <span className={`${styles.badge} ${styles.danger}`}>Missed</span>
                    ) : overdue ? (
                      <span className={`${styles.badge} ${styles.danger}`}>Overdue</span>
                    ) : (
                      <span className={styles.badge}>{timeUntil(dt)}</span>
                    )}
                    {a.reminder_minutes > 0 && a.status === 'pending' && (
                      <span className={styles.metaItem}>
                        {ICONS.bell} {formatReminder(a.reminder_minutes)}
                      </span>
                    )}
                    {(a.account_name || a.project_name) && (
                      <span className={styles.metaItem}>{a.account_name || a.project_name}</span>
                    )}
                    {a.created_at && (
                      <span className={styles.metaItem} title="When it was booked (the appointment's timezone)">
                        Booked {bookedLabel(a)}
                      </span>
                    )}
                  </div>
                  {a.description && <div className={styles.taskDesc}>{a.description}</div>}
                </div>
                <div className={styles.taskActions}>
                  {a.status === 'pending' && (
                    <button type="button" className={styles.missBtn} onClick={() => onMiss(a.id)}>
                      Miss
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete"
                    onClick={() => handleDelete(a)}
                  >
                    {ICONS.trash}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {modalOpen && (
        <AppointmentModal
          appointment={editing}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete appointment"
          message={`Delete "${deleting.title}"? This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
