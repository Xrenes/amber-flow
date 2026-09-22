import React from 'react';
import type { AdminData } from './useAdminData';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
}

// Ports admin.js's renderActivity(): flat reverse-chron feed of activity_logs.
export default function ActivityTab({ data }: Props) {
  const { logs, profileMap } = data;

  if (!logs.length) {
    return <p className={styles.feedPlaceholder}>No activity logged yet.</p>;
  }

  return (
    <div className={styles.activityFeed}>
      {logs.map((log) => {
        const profile = profileMap[log.user_id];
        const name = profile?.name || 'Unknown';
        const role = profile?.role || '';
        const action = (log.action_type || '').replace(/_/g, ' ');
        const meta = (log.metadata || {}) as Record<string, unknown>;
        const detail = typeof meta.projectName === 'string' && meta.projectName ? ` · ${meta.projectName}` : '';
        const title = typeof meta.title === 'string' && meta.title ? ` "${meta.title}"` : '';
        const ts = log.created_at
          ? new Date(log.created_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : '';
        return (
          <div key={log.id} className={styles.feedItem}>
            <span className={styles.feedAgent}>{name}</span>
            {role && <span className={`${styles.roleBadge} ${styles[role] || ''}`}>{role}</span>}
            <span className={styles.feedAction}>
              {action}
              {detail}
              {title}
            </span>
            <span className={styles.feedTs}>{ts}</span>
          </div>
        );
      })}
    </div>
  );
}
