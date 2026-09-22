import React, { useEffect, useMemo, useState } from 'react';
import type { Appointment } from '@amber-flow/shared';
import styles from './AppointmentModal.module.css';
import { apptFmtDisplay, apptFmtLocal, browserTimezone, listTimezones, tzLocalToUTC, utcToTZLocal } from './tzUtil';
import type { NewAppointmentInput } from './useAppointments';

interface AppointmentModalProps {
  appointment: Appointment | null; // null = creating a new one
  onSave: (input: NewAppointmentInput) => Promise<void> | void;
  onClose: () => void;
}

// Ports app.js's appt modal (openApptModal/closeApptModal/apptForm submit).
// Reminder-minutes isn't exposed as a field in the original HTML (it's hardcoded
// to 0 on create and left untouched on edit), but the shared API and DB schema
// carry reminder_minutes, so this port exposes a select matching the task modal's
// reminder options — an intentional, minor UX addition to make the field reachable.
export default function AppointmentModal({ appointment, onSave, onClose }: AppointmentModalProps) {
  const tzList = useMemo(() => listTimezones(), []);
  const defaultTz = useMemo(() => browserTimezone(), []);

  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState(defaultTz);
  const [dateTimeLocal, setDateTimeLocal] = useState(''); // "YYYY-MM-DDTHH:MM"
  const [reminderMinutes, setReminderMinutes] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appointment) {
      const tz = appointment.timezone || defaultTz;
      setProjectName(appointment.project_name);
      setTitle(appointment.title);
      setDescription(appointment.description || '');
      setTimezone(tz);
      setDateTimeLocal(utcToTZLocal(appointment.scheduled_time, tz));
      setReminderMinutes(appointment.reminder_minutes || 0);
    } else {
      setProjectName('');
      setTitle('');
      setDescription('');
      setTimezone(defaultTz);
      setDateTimeLocal(apptFmtLocal(new Date()));
      setReminderMinutes(0);
    }
  }, [appointment, defaultTz]);

  // "Now" badge preview — ports _apptUpdateTimeBadge.
  const timeBadge = useMemo(() => {
    if (!dateTimeLocal) return 'Now';
    try {
      const utcIso = tzLocalToUTC(dateTimeLocal, timezone || defaultTz);
      return apptFmtDisplay(utcIso, timezone || defaultTz);
    } catch {
      return 'Now';
    }
  }, [dateTimeLocal, timezone, defaultTz]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const proj = projectName.trim();
    const t = title.trim();
    if (!proj || !t || !dateTimeLocal) return;
    const tz = timezone || defaultTz;
    const scheduledTime = tzLocalToUTC(dateTimeLocal, tz);
    setSaving(true);
    try {
      await onSave({
        projectName: proj,
        title: t,
        description: description.trim(),
        scheduledTime,
        timezone: tz,
        reminderMinutes,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>{appointment ? 'Edit Appointment' : 'New Appointment'}</h2>
          <button type="button" className={styles.iconBtn} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form className={styles.modalBody} onSubmit={handleSubmit}>
          <label>
            <span>Project / Client Name</span>
            <input
              type="text"
              required
              maxLength={80}
              placeholder="e.g. Insurance Lead"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </label>
          <label>
            <span>Title</span>
            <input
              type="text"
              required
              maxLength={120}
              placeholder="e.g. Follow-up call"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            <span>
              Description <em>(optional)</em>
            </span>
            <textarea
              rows={2}
              placeholder="Notes or context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className={styles.timeRow}>
            <div className={styles.timeNowBadge}>
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{timeBadge}</span>
            </div>
            <input
              type="datetime-local"
              required
              className={styles.dateTimeInput}
              value={dateTimeLocal}
              onChange={(e) => setDateTimeLocal(e.target.value)}
            />
          </div>

          <label className={styles.tzRow}>
            <span>
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Time Zone
            </span>
            <select className={styles.tzSelect} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {tzList.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Reminder</span>
            <select value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}>
              <option value={0}>At time of appointment</option>
              <option value={5}>5 minutes before</option>
              <option value={10}>10 minutes before</option>
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={120}>2 hours before</option>
              <option value={1440}>1 day before</option>
            </select>
          </label>

          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.ctaBtn} disabled={saving}>
              Save Appointment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
