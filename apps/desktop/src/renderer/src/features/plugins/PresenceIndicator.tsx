import React from 'react';
import styles from './PresenceIndicator.module.css';

// Small always-visible badge shown to the agent whenever the Idle/Active
// Status plugin is on, so tracking is never silent/hidden — the agent sees
// exactly what status is being reported.
export default function PresenceIndicator({ status }: { status: 'active' | 'idle' | 'away' }) {
  const label = status === 'active' ? 'Active' : status === 'idle' ? 'Idle' : 'Away';
  return (
    <div className={`${styles.badge} ${styles[status]}`} title="Your status is visible to your team's admin">
      <span className={styles.dot} />
      {label}
    </div>
  );
}
