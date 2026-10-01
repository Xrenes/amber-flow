import React, { useEffect, useMemo, useState } from 'react';
import { AGENT_NAME_PREFIX, buildAgentOptions, parseAgentValue, agentValueFor } from '@amber-flow/shared';
import type { Appointment } from '@amber-flow/shared';
import styles from './AppointmentModal.module.css';
import { apptFmtLocal, browserTimezone, listTimezones, tzLocalToUTC, utcToTZLocal } from './tzUtil';
import type { NewAppointmentInput } from './useAppointments';
import { useTaskFieldOptions } from './useTaskFieldOptions';
import { useTeamDirectory } from './useTeamDirectory';
import Dropdown from '../../components/Dropdown';
import ScrollTimePicker from '../timepicker/ScrollTimePicker';

interface AppointmentModalProps {
  appointment: Appointment | null; // null = creating a new one
  currentUserId: string;
  currentUserName: string;
  onSave: (input: NewAppointmentInput) => Promise<void> | void;
  onClose: () => void;
}

// Quick timezone blocks — matches TaskModal's QUICK_TZS.
const QUICK_TZS: Record<string, string> = {
  ET: 'America/New_York',
  CT: 'America/Chicago',
  MT: 'America/Denver',
  PT: 'America/Los_Angeles',
};

// "14:05" -> "2:05 PM", for the time-picker trigger button's label.
function formatTimeDisplay(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Ports app.js's appt modal (openApptModal/closeApptModal/apptForm submit).
// Reminder-minutes isn't exposed as a field in the original HTML (it's hardcoded
// to 0 on create and left untouched on edit), but the shared API and DB schema
// carry reminder_minutes, so this port exposes a select matching the task modal's
// reminder options — an intentional, minor UX addition to make the field reachable.
export default function AppointmentModal({ appointment, currentUserId, currentUserName, onSave, onClose }: AppointmentModalProps) {
  const tzList = useMemo(() => listTimezones(), []);
  const defaultTz = useMemo(() => browserTimezone(), []);
  const accountField = useTaskFieldOptions('account');
  const projectField = useTaskFieldOptions('project');
  const agentField = useTaskFieldOptions('agent');
  const { members: teamMembers } = useTeamDirectory();

  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState(defaultTz);
  const [showTzSelect, setShowTzSelect] = useState(false);
  const [date, setDate] = useState(''); // "YYYY-MM-DD"
  const [time, setTime] = useState(''); // "HH:MM"
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(0);
  const [accountName, setAccountName] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [saving, setSaving] = useState(false);

  // Team members with a login + admin-added agent names (Field Options →
  // Agent names). Until the team list loads, keep "me" selectable.
  const agentOptions = useMemo(() => {
    const members = teamMembers.some((m) => m.id === currentUserId)
      ? teamMembers
      : [{ id: currentUserId, name: currentUserName }, ...teamMembers];
    const names = agentField.options.map((o) => o.value);
    // An existing appointment's name that was since removed from the list stays selectable.
    const picked = assignedUserId.startsWith(AGENT_NAME_PREFIX) ? assignedUserId.slice(AGENT_NAME_PREFIX.length) : null;
    if (picked && !names.includes(picked)) names.push(picked);
    return buildAgentOptions(members, names, currentUserId);
  }, [teamMembers, agentField.options, assignedUserId, currentUserId, currentUserName]);

  useEffect(() => {
    if (appointment) {
      const tz = appointment.timezone || defaultTz;
      const local = utcToTZLocal(appointment.scheduled_time, tz);
      const [d, t] = local.split('T');
      setProjectName(appointment.project_name);
      setTitle(appointment.title);
      setDescription(appointment.description || '');
      setTimezone(tz);
      setShowTzSelect(!Object.values(QUICK_TZS).includes(tz));
      setDate(d);
      setTime(t);
      setReminderMinutes(appointment.reminder_minutes || 0);
      setAccountName(appointment.account_name || '');
      setAssignedUserId(agentValueFor(appointment));
    } else {
      const nowLocal = apptFmtLocal(new Date());
      const [d, t] = nowLocal.split('T');
      setProjectName('');
      setTitle('');
      setDescription('');
      setTimezone(defaultTz);
      setShowTzSelect(!Object.values(QUICK_TZS).includes(defaultTz));
      setDate(d);
      setTime(t);
      setReminderMinutes(0);
      setAccountName('');
      setAssignedUserId(currentUserId);
    }
  }, [appointment, defaultTz, currentUserId]);

  function pickQuickTz(tz: string) {
    setTimezone(tz);
    setShowTzSelect(false);
  }

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
    if (!proj || !t || !date || !time) return;
    const tz = timezone || defaultTz;
    const scheduledTime = tzLocalToUTC(`${date}T${time}`, tz);
    setSaving(true);
    try {
      await onSave({
        projectName: proj,
        title: t,
        description: description.trim(),
        scheduledTime,
        timezone: tz,
        reminderMinutes,
        accountName: accountName.trim(),
        ...(() => {
          const { userId, agentName } = parseAgentValue(assignedUserId, currentUserId);
          return { assignedUserId: userId, agentName };
        })(),
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
            <span>Project / Client Name</span>
            {projectField.mode === 'dropdown' ? (
              <Dropdown
                value={projectName}
                onChange={setProjectName}
                options={[{ value: '', label: '— None —' }, ...projectField.options.map((opt) => ({ value: opt.value, label: opt.value }))]}
              />
            ) : (
              <input
                type="text"
                required
                maxLength={80}
                placeholder="e.g. Insurance Lead"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            )}
          </label>
          <label>
            <span>
              Description <em>(optional)</em>
            </span>
            <textarea
              rows={3}
              placeholder="Notes or context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className={styles.row}>
            <label>
              <span>Date</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              <span>Time</span>
              <button
                type="button"
                className={styles.timePickerTrigger}
                onClick={() => setTimePickerOpen(true)}
              >
                {time ? formatTimeDisplay(time) : 'Select time'}
              </button>
            </label>
          </div>
          <div className={styles.row}>
            <label>
              <span>Account</span>
              {accountField.mode === 'dropdown' ? (
                <Dropdown
                  value={accountName}
                  onChange={setAccountName}
                  options={[{ value: '', label: '— None —' }, ...accountField.options.map((opt) => ({ value: opt.value, label: opt.value }))]}
                />
              ) : (
                <input
                  type="text"
                  placeholder="e.g. Upwork - Client X"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              )}
            </label>
            <label>
              <span>Agent</span>
              <Dropdown value={assignedUserId} onChange={setAssignedUserId} options={agentOptions} />
            </label>
          </div>
          <label>
            <span>Reminder</span>
            <Dropdown
              value={String(reminderMinutes)}
              onChange={(v) => setReminderMinutes(Number(v))}
              options={[
                { value: '0', label: 'At time of appointment' },
                { value: '5', label: '5 minutes before' },
                { value: '10', label: '10 minutes before' },
                { value: '15', label: '15 minutes before' },
                { value: '30', label: '30 minutes before' },
                { value: '60', label: '1 hour before' },
                { value: '120', label: '2 hours before' },
                { value: '1440', label: '1 day before' },
              ]}
            />
          </label>
          <div className={styles.apptTzRow}>
            <span className={styles.apptTzLabel}>Timezone</span>
            <div className={styles.apptTzBlocks}>
              {Object.entries(QUICK_TZS).map(([label, tz]) => (
                <button
                  key={tz}
                  type="button"
                  className={`${styles.tzBlock} ${!showTzSelect && timezone === tz ? styles.active : ''}`}
                  onClick={() => pickQuickTz(tz)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.tzBlock} ${styles.tzBlockMore} ${showTzSelect ? styles.active : ''}`}
                title="More timezones"
                onClick={() => setShowTzSelect((v) => !v)}
              >
                +
              </button>
            </div>
            {showTzSelect && (
              <Dropdown
                className={styles.apptTzCustom}
                value={timezone}
                onChange={setTimezone}
                options={tzList.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
              />
            )}
          </div>

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

      {timePickerOpen && (
        <ScrollTimePicker
          value={time}
          onChange={setTime}
          onClose={() => setTimePickerOpen(false)}
        />
      )}
    </div>
  );
}
