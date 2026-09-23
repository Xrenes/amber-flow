import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Task, UpsertTaskInput } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import ScrollTimePicker from '../timepicker/ScrollTimePicker';
import { useTaskFieldOptions } from './useTaskFieldOptions';
import styles from './TaskModal.module.css';

interface TaskModalProps {
  userId: string;
  task: Task | null; // null = creating a new task
  onClose: () => void;
  onSave: (task: UpsertTaskInput) => void;
}

// Quick timezone blocks — matches app.js's QUICK_TZS.
const QUICK_TZS: Record<string, string> = {
  ET: 'America/New_York',
  CT: 'America/Chicago',
  MT: 'America/Denver',
  PT: 'America/Los_Angeles',
};

const REMINDER_OPTIONS = [
  { value: 0, label: 'At time of task' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// "14:05" -> "2:05 PM", for the time-picker trigger button's label.
function formatTimeDisplay(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function allTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      /* fall through */
    }
  }
  return Object.values(QUICK_TZS).concat([
    'Europe/London',
    'Europe/Paris',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Dhaka',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]);
}

// Ports app.js's openModal()/closeModal() + taskForm submit handler, using
// the ported ScrollTimePicker wheel widget for the time field.
export default function TaskModal({ userId, task, onClose, onSave }: TaskModalProps) {
  const isEdit = !!task;
  const defaultTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState(60);
  const [timezone, setTimezone] = useState(defaultTz);
  const [showTzSelect, setShowTzSelect] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [campaignName, setCampaignName] = useState('');

  // Agent is always the real name of whoever is creating/editing the task —
  // auto-filled, not user-editable.
  const agentName = user?.name || '';

  const accountField = useTaskFieldOptions('account');
  const campaignField = useTaskFieldOptions('campaign');

  const titleRef = useRef<HTMLInputElement>(null);
  const timezones = useMemo(allTimezones, []);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDate(task.date);
      setTime(task.time);
      setReminderMinutes(task.reminder_minutes ?? 60);
      const tz = task.timezone || defaultTz;
      setTimezone(tz);
      setShowTzSelect(!Object.values(QUICK_TZS).includes(tz));
      setAccountName(task.account_name || '');
      setCampaignName(task.campaign_name || '');
    } else {
      const now = new Date(Date.now() + 60 * 60000); // default: 1h from now
      setTitle('');
      setDescription('');
      setDate(now.toISOString().slice(0, 10));
      setTime(now.toTimeString().slice(0, 5));
      setReminderMinutes(60);
      setTimezone(defaultTz);
      setShowTzSelect(!Object.values(QUICK_TZS).includes(defaultTz));
      setAccountName('');
      setCampaignName('');
    }
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [task, defaultTz]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !date || !time) return;

    const data: UpsertTaskInput = {
      id: task ? task.id : uid(),
      user_id: userId,
      title: trimmedTitle,
      description: description.trim() || null,
      date,
      time,
      reminder_minutes: reminderMinutes,
      completed: task?.completed ?? false,
      lead_status: task?.lead_status ?? null,
      timezone: timezone || defaultTz,
      agent_name: agentName || null,
      account_name: accountName.trim() || null,
      campaign_name: campaignName.trim() || null,
    };
    onSave(data);
    onClose();
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function pickQuickTz(tz: string) {
    setTimezone(tz);
    setShowTzSelect(false);
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>{isEdit ? 'Edit Task' : 'New Task'}</h2>
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
              ref={titleRef}
              type="text"
              required
              maxLength={120}
              placeholder="Follow up with client"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            <span>
              Description <em>(optional)</em>
            </span>
            <textarea
              rows={3}
              placeholder="Notes, links, context..."
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
                <select value={accountName} onChange={(e) => setAccountName(e.target.value)}>
                  <option value="">— None —</option>
                  {accountField.options.map((opt) => (
                    <option key={opt.id} value={opt.value}>
                      {opt.value}
                    </option>
                  ))}
                </select>
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
              <input type="text" value={agentName} disabled readOnly />
            </label>
          </div>
          <label>
            <span>Campaign</span>
            {campaignField.mode === 'dropdown' ? (
              <select value={campaignName} onChange={(e) => setCampaignName(e.target.value)}>
                <option value="">— None —</option>
                {campaignField.options.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.value}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="e.g. Q4 Outreach"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            )}
          </label>
          <label>
            <span>Reminder</span>
            <select value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}>
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.taskTzRow}>
            <span className={styles.taskTzLabel}>Timezone</span>
            <div className={styles.taskTzBlocks}>
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
            <select
              className={`${styles.taskTzCustom} ${showTzSelect ? '' : styles.hidden}`}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryBtn}>
              Save Task
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
