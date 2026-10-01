import type { Appointment } from '@amber-flow/shared';
import styles from './AppointmentDetailCard.module.css';
import { tzShortLabel } from './tzUtil';

interface Props {
  appointment: Appointment;
  agentName?: string;
  tz?: string;
  onClose: () => void;
}

// A small popup card opened by clicking an appointment's date — shows the
// full picture (title, date, description, contact info) that the
// date-grouped tables don't have room for per-row.
export default function AppointmentDetailCard({ appointment: a, agentName, tz, onClose }: Props) {
  const dateStr = a.scheduled_time
    ? new Date(a.scheduled_time).toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unknown date';
  const tzShort = a.scheduled_time && tz ? tzShortLabel(a.scheduled_time, tz) : '';
  // When it was booked, in this computer's own clock.
  const bookedStr = a.created_at
    ? new Date(a.created_at).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>{a.title || 'Untitled appointment'}</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.dateRow}>
          {dateStr}
          {tzShort ? ` ${tzShort}` : ''}
        </div>
        <div className={styles.bookedRow}>Booked {bookedStr}</div>

        {a.description && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Description</div>
            <div className={styles.sectionBody}>{a.description}</div>
          </div>
        )}

        <div className={styles.grid}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Agent</div>
            <div className={styles.fieldVal}>{agentName || '—'}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Account</div>
            <div className={styles.fieldVal}>{a.account_name || '—'}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Project / Client Name</div>
            <div className={styles.fieldVal}>{a.project_name || '—'}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Status</div>
            <div className={styles.fieldVal}>{a.status}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
