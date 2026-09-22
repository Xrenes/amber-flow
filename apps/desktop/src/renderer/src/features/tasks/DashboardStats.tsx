import React from 'react';
import type { Task } from '@amber-flow/shared';
import styles from './DashboardStats.module.css';

interface DashboardStatsProps {
  tasks: Task[];
}

// Ports app.js render()'s stats block: total / done / pending / progress %.
export default function DashboardStats({ tasks }: DashboardStatsProps) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pending = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className={styles.dashboard}>
      <div className={`${styles.card} ${styles.statCard}`}>
        <p className={styles.statLabel}>Total Tasks</p>
        <h2>{total}</h2>
      </div>
      <div className={`${styles.card} ${styles.statCard}`}>
        <p className={styles.statLabel}>Completed</p>
        <h2>{done}</h2>
      </div>
      <div className={`${styles.card} ${styles.statCard}`}>
        <p className={styles.statLabel}>Pending</p>
        <h2>{pending}</h2>
      </div>
      <div className={`${styles.card} ${styles.progressCard}`}>
        <div className={styles.progressHeader}>
          <p className={styles.statLabel}>Progress</p>
          <span>{pct}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}
