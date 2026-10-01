import React, { useEffect, useState } from 'react';
import {
  listTaskFieldOptions,
  addTaskFieldOption,
  deleteTaskFieldOption,
  getTaskFieldConfig,
  setTaskFieldMode,
} from '@amber-flow/shared';
import type { TaskFieldName, TaskFieldMode, TaskFieldOption } from '@amber-flow/shared';
import styles from './TaskFieldsTab.module.css';

function FieldEditor({
  field,
  label,
  hint,
  listOnly,
}: {
  field: TaskFieldName;
  label: string;
  hint?: string;
  /** Always a dropdown list — no free-text mode (used for Agent names). */
  listOnly?: boolean;
}) {
  const [options, setOptions] = useState<TaskFieldOption[]>([]);
  const [mode, setMode] = useState<TaskFieldMode>('dropdown');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [optRes, cfgRes] = await Promise.all([listTaskFieldOptions(field), getTaskFieldConfig()]);
    if (optRes.data) setOptions(optRes.data);
    const cfg = cfgRes.data?.find((c) => c.field === field);
    if (cfg) setMode(cfg.mode);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = newValue.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    const { error: err } = await addTaskFieldOption(field, value);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    setNewValue('');
    await refresh();
    setBusy(false);
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await deleteTaskFieldOption(id);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  }

  async function handleModeChange(next: TaskFieldMode) {
    setMode(next);
    await setTaskFieldMode(field, next);
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>{label}</h3>
        {!listOnly && (
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'dropdown' ? styles.modeActive : ''}`}
            onClick={() => handleModeChange('dropdown')}
          >
            Dropdown
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'text' ? styles.modeActive : ''}`}
            onClick={() => handleModeChange('text')}
          >
            Free text
          </button>
        </div>
        )}
      </div>

      {hint && <p className={styles.hint}>{hint}</p>}

      {!listOnly && mode === 'text' && (
        <p className={styles.hint}>
          Agents will type this field in as free text — the list below is unused while this mode is
          selected.
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <form className={styles.addRow} onSubmit={handleAdd}>
        <input
          type="text"
          placeholder={`Add a new ${label.toLowerCase()} value...`}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className={styles.addBtn} disabled={busy || !newValue.trim()}>
          Add
        </button>
      </form>

      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : options.length === 0 ? (
        <p className={styles.empty}>No values yet — add one above.</p>
      ) : (
        <ul className={styles.list}>
          {options.map((opt) => (
            <li key={opt.id} className={styles.listItem}>
              <span>{opt.value}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleDelete(opt.id)}
                disabled={busy}
                aria-label={`Remove ${opt.value}`}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Admin-only tab: manage the Agents/Account/Campaign/Project dropdown values shown
// in the New Appointment modal, and toggle each field between a dropdown and
// free text. Contact Name and Lead Status used to be settable fields too,
// but were removed from Appointments entirely, so there's nothing left to
// configure for them here.
export default function TaskFieldsTab() {
  return (
    <div className={styles.grid}>
      <FieldEditor
        field="agent"
        label="Agents"
        listOnly
        hint="Names added here appear in every Agent dropdown alongside team members who have a login. An appointment booked for one of these names is saved under whoever booked it, with this name shown as the agent."
      />
      <FieldEditor field="account" label="Account" />
      <FieldEditor field="campaign" label="Campaign" />
      <FieldEditor field="project" label="Project / Client Name" />
    </div>
  );
}
