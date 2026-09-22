import React from 'react';
import styles from './AlarmOverlay.module.css';
import type { AlarmItem, AlarmKind, AlarmLabelKind } from './useAlarm';

interface AlarmOverlayProps {
  item: AlarmItem;
  kind: AlarmKind;
  labelKind?: AlarmLabelKind;
  onDismiss: () => void;
  onSnooze: () => void;
}

// Ports app.js's full-screen #alarmScreen markup: pulsing glow, shaking clock
// icon, label ("REMINDER" / "TASK DUE" / "APPOINTMENT DUE"), title, time,
// description, and Snooze/Dismiss actions.
export default function AlarmOverlay({ item, kind, labelKind = 'due', onDismiss, onSnooze }: AlarmOverlayProps) {
  const label =
    labelKind === 'reminder' ? 'REMINDER' : kind === 'appointment' ? 'APPOINTMENT DUE' : 'TASK DUE';

  return (
    <div className={styles.alarmScreen}>
      <div className={styles.alarmPulse} />
      <div className={styles.alarmContent}>
        <div className={styles.alarmIcon}>
          <svg viewBox="0 0 24 24" width="80" height="80" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2.5" />
            <path d="M5 3 2 6" />
            <path d="m22 6-3-3" />
          </svg>
        </div>
        <p className={styles.alarmLabel}>{label}</p>
        <h1>{item.title}</h1>
        {item.displayTime ? <p>{item.displayTime}</p> : null}
        {item.description ? <p className={styles.alarmDesc}>{item.description}</p> : null}
        <div className={styles.alarmActions}>
          <button type="button" className={styles.snoozeBtn} onClick={onSnooze}>
            Snooze 5 min
          </button>
          <button type="button" className={styles.dismissBtn} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
