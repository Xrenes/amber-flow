import React from 'react';
import { COLUMNS, COLUMN_LABEL, DEFAULT_VIEW, type ColumnKey, type GroupKey, type SheetView } from './apptSheet';
import styles from './SheetViewSettings.module.css';

interface Props {
  view: SheetView;
  onChange: (view: SheetView) => void;
  onClose: () => void;
}

const GROUPABLE = COLUMNS.filter((c) => c.groupable);

// "View settings" for the Appointments sheet: which columns show, and which
// one or two columns rows are grouped by (two combine into one group, e.g.
// Agent + Status → "Tawsif · Completed").
export default function SheetViewSettings({ view, onChange, onClose }: Props) {
  function toggleColumn(key: ColumnKey) {
    const on = view.visible.includes(key);
    if (on && view.visible.length === 1) return; // keep at least one column
    const visible = on ? view.visible.filter((k) => k !== key) : COLUMNS.map((c) => c.key).filter((k) => k === key || view.visible.includes(k));
    onChange({ ...view, visible });
  }

  function setGroup(level: 0 | 1, value: GroupKey) {
    const groupBy: [GroupKey, GroupKey] = [...view.groupBy];
    groupBy[level] = value;
    if (level === 0 && value === 'none') groupBy[1] = 'none';
    if (groupBy[1] === groupBy[0]) groupBy[1] = 'none';
    onChange({ ...view, groupBy });
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="View settings">
      <div className={styles.head}>
        <span className={styles.title}>View settings</span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Columns</div>
        <div className={styles.columns}>
          {COLUMNS.map((c) => (
            <label key={c.key} className={styles.check}>
              <input type="checkbox" checked={view.visible.includes(c.key)} onChange={() => toggleColumn(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Group rows by</div>
        <div className={styles.groupRow}>
          <select value={view.groupBy[0]} onChange={(e) => setGroup(0, e.target.value as GroupKey)}>
            <option value="none">No grouping</option>
            {GROUPABLE.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <span className={styles.plus}>+</span>
          <select
            value={view.groupBy[1]}
            disabled={view.groupBy[0] === 'none'}
            onChange={(e) => setGroup(1, e.target.value as GroupKey)}
          >
            <option value="none">Nothing else</option>
            {GROUPABLE.filter((c) => c.key !== view.groupBy[0]).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.hint}>
          {view.groupBy[0] === 'none'
            ? 'One flat list, sorted by the column you click.'
            : view.groupBy[1] === 'none'
              ? `One section per ${COLUMN_LABEL[view.groupBy[0] as ColumnKey].toLowerCase()}, with counts.`
              : `One section per ${COLUMN_LABEL[view.groupBy[0] as ColumnKey].toLowerCase()} + ${COLUMN_LABEL[
                  view.groupBy[1] as ColumnKey
                ].toLowerCase()} combination, with counts.`}
        </p>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.reset} onClick={() => onChange(DEFAULT_VIEW)}>
          Reset view
        </button>
      </div>
    </div>
  );
}
