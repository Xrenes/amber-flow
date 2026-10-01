import React from 'react';
import type { Appointment } from '@amber-flow/shared';
import { apptDayKey } from './apptFormat';
import styles from './AppointmentStats.module.css';

interface AppointmentStatsProps {
  appointments: Appointment[];
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Home dashboard summary — the agent's own appointments at a glance, in
// the same strip style as Admin and My Reports: today, upcoming, completed,
// missed, and a completion rate (completed out of completed + missed).
export default function AppointmentStats({ appointments }: AppointmentStatsProps) {
  const today = todayKey();
  const now = Date.now();
  const todayCount = appointments.filter((a) => apptDayKey(a) === today).length;
  const upcoming = appointments.filter((a) => a.status === 'pending' && new Date(a.scheduled_time).getTime() >= now).length;
  const done = appointments.filter((a) => a.status === 'completed').length;
  const missed = appointments.filter((a) => a.status === 'missed').length;
  const decided = done + missed;
  const pct = decided ? Math.round((done / decided) * 100) : null;

  return (
    <section className={styles.strip} aria-label="Appointment summary">
      <div className={styles.stat}>
        <span className={styles.value}>{todayCount}</span>
        <span className={styles.label}>Today</span>
      </div>
      <div className={styles.stat}>
        <span className={`${styles.value} ${styles.accent}`}>{upcoming}</span>
        <span className={styles.label}>Upcoming</span>
      </div>
      <div className={styles.stat}>
        <span className={`${styles.value} ${styles.good}`}>{done}</span>
        <span className={styles.label}>Completed</span>
      </div>
      <div className={styles.stat}>
        <span className={`${styles.value} ${missed ? styles.bad : ''}`}>{missed}</span>
        <span className={styles.label}>Missed</span>
      </div>
      <div className={`${styles.stat} ${styles.rateStat}`}>
        <div className={styles.rateTop}>
          <span className={styles.label}>Completion rate</span>
          <span className={styles.rateVal}>{pct === null ? '—' : `${pct}%`}</span>
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${pct ?? 0}%` }} />
        </div>
        <span className={styles.sub}>{decided ? `${done} of ${decided} finished appointments` : 'No finished appointments yet'}</span>
      </div>
    </section>
  );
}
