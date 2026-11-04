import React, { useRef, useState } from 'react';
import styles from './WorldClocks.module.css';

// Fast time entry with no popup and no confirm step: type the time, or click
// an hour, a minute and AM/PM. Every change applies immediately.
// Value is 24h "HH:MM".

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Accepts "3", "3:30", "330", "3:30 pm", "330p", "9a", "15:30", "0:15".
// Without am/pm, 1–12 keep the current AM/PM and 0 / 13–23 read as 24-hour.
export function parseTime(text: string, pm: boolean): string | null {
  const m = text.trim().toLowerCase().replace(/[\s.]/g, '').match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith('p') ? 12 : 0);
  } else if (h >= 1 && h <= 12) {
    h = (h % 12) + (pm ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return `${pad2(h)}:${pad2(min)}`;
}

interface Props {
  value: string;
  onChange: (hhmm: string) => void;
}

export default function QuickTimeInput({ value, onChange }: Props) {
  const [H24, MIN] = value.split(':').map(Number);
  const pm = H24 >= 12;
  const h12 = ((H24 + 11) % 12) + 1;
  const display = `${h12}:${pad2(MIN)}`;

  // Text while the field is being edited (null = show the current value).
  const [draft, setDraft] = useState<string | null>(null);
  const valueAtFocus = useRef(value);
  const keepSelection = useRef(false);

  const set = (h: number, m: number) => onChange(`${pad2(h)}:${pad2(m)}`);

  return (
    <div className={styles.convPicks}>
      <div className={`${styles.convPickRow} ${styles.convPickRowCenter}`}>
        <span className={styles.convPickLabel}>Time</span>
        <div className={styles.convTimePicker}>
          <input
            type="text"
            className={styles.convTimeInput}
            value={draft ?? display}
            placeholder="3:30"
            aria-label="Time, type for example 3:30, 330p or 15:30"
            title="Type a time (3:30, 330p, 15:30) or click an hour and minute below"
            onFocus={(e) => {
              valueAtFocus.current = value;
              setDraft(display);
              e.currentTarget.select(); // typing replaces the whole time
              keepSelection.current = true;
            }}
            onMouseUp={(e) => {
              // Stop the focusing click from collapsing that selection.
              if (keepSelection.current) e.preventDefault();
              keepSelection.current = false;
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              const t = parseTime(e.target.value, pm);
              if (t) onChange(t);
            }}
            onBlur={() => {
              // Finished with something unreadable (e.g. "99", "") → put back the time from before editing.
              if (draft !== null && !parseTime(draft, pm)) onChange(valueAtFocus.current);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                onChange(valueAtFocus.current);
                e.currentTarget.blur();
              }
            }}
          />
          <div className={styles.convAmPm} role="group" aria-label="AM or PM">
            <button type="button" aria-pressed={!pm} className={!pm ? styles.convAmPmOn : ''} onClick={() => pm && set(H24 - 12, MIN)}>
              AM
            </button>
            <button type="button" aria-pressed={pm} className={pm ? styles.convAmPmOn : ''} onClick={() => !pm && set(H24 + 12, MIN)}>
              PM
            </button>
          </div>
        </div>
      </div>

      <div className={styles.convPickRow}>
        <span className={styles.convPickLabel}>Hour</span>
        <div className={styles.convPickGrid} role="group" aria-label="Hour">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={h === h12}
              className={`${styles.convPick} ${h === h12 ? styles.convPickOn : ''}`}
              onClick={() => set((h % 12) + (pm ? 12 : 0), MIN)}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.convPickRow}>
        <span className={styles.convPickLabel}>Minute</span>
        <div className={styles.convPickGrid} role="group" aria-label="Minute">
          {MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === MIN}
              aria-label={`:${pad2(m)}`}
              className={`${styles.convPick} ${m === MIN ? styles.convPickOn : ''}`}
              onClick={() => set(H24, m)}
            >
              :{pad2(m)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
