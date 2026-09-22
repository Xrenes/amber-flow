import React, { useMemo, useState } from 'react';
import type { Appointment } from '@amber-flow/shared';
import styles from './AppointmentList.module.css';
import { apptFmtDisplay, browserTimezone, tzShortLabel } from './tzUtil';
import AppointmentModal from './AppointmentModal';
import type { NewAppointmentInput } from './useAppointments';

interface AppointmentListProps {
  appointments: Appointment[];
  onCreate: (input: NewAppointmentInput) => Promise<void> | void;
  onUpdate: (id: string, input: NewAppointmentInput) => Promise<void> | void;
  onComplete: (id: string) => void;
  onMiss: (id: string) => void;
  onDelete: (id: string) => void;
}

function apptStatusLabel(status: Appointment['status']): string {
  switch (status) {
    case 'pending':
      return 'Upcoming';
    case 'completed':
      return 'Done';
    case 'missed':
      return 'Missed';
    default:
      return status;
  }
}

// Ports app.js's renderAppointments(): pending soonest-first, then
// completed/missed most-recent-first, plus the appt-card markup and actions.
export default function AppointmentList({
  appointments,
  onCreate,
  onUpdate,
  onComplete,
  onMiss,
  onDelete,
}: AppointmentListProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const sorted = useMemo(() => {
    const pending = appointments
      .filter((a) => a.status === 'pending')
      .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
    const rest = appointments
      .filter((a) => a.status !== 'pending')
      .sort((a, b) => new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime());
    return [...pending, ...rest];
  }, [appointments]);

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

  return (
    <section className={styles.apptSection}>
      <div className={styles.apptHeader}>
        <h2 className={styles.sectionTitle}>
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Appointments
        </h2>
        <button type="button" className={styles.primaryBtn} onClick={openCreate}>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Appointment
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h3>No appointments</h3>
          <p>Tap "New Appointment" to schedule a follow-up.</p>
        </div>
      ) : (
        <div className={styles.apptList}>
          {sorted.map((a) => {
            const tz = a.timezone || browserTimezone();
            const dtStr = apptFmtDisplay(a.scheduled_time, tz);
            const tzShort = tzShortLabel(a.scheduled_time, tz);
            return (
              <div key={a.id} className={styles.apptCard}>
                <div className={styles.apptCardTop}>
                  <span className={`${styles.apptBadge} ${styles[a.status]}`}>{apptStatusLabel(a.status)}</span>
                  <span className={styles.apptProject}>{a.project_name}</span>
                  <div className={styles.apptActions}>
                    {a.status === 'pending' && (
                      <>
                        <button type="button" className={styles.apptDoneBtn} onClick={() => onComplete(a.id)}>
                          Done
                        </button>
                        <button type="button" className={styles.apptMissBtn} onClick={() => onMiss(a.id)}>
                          Miss
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Edit"
                      onClick={() => openEdit(a)}
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.danger}`}
                      title="Delete"
                      onClick={() => onDelete(a.id)}
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                <h3 className={styles.apptTitle}>{a.title}</h3>
                {a.description ? <p className={styles.apptDesc}>{a.description}</p> : null}
                <div className={styles.apptMeta}>
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {dtStr}
                  {tzShort ? <span className={styles.apptTzBadge}>{tzShort}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <AppointmentModal
          appointment={editing}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
