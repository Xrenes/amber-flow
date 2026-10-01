import React from 'react';
import type { ActivityLog } from '@amber-flow/shared';
import { useRecentActivity } from './useRecentActivity';
import { TIMELINE_ICONS, timelineKindTone } from './timelineIcons';
import styles from './AdminShared.module.css';

interface Props {
  userId: string;
  logs: ActivityLog[];
  onSelect?: (dayKey: string) => void;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

// Compact recent-activity feed embedded directly in each Overview agent
// card — logins, breaks, appointments (with account + contact name baked
// into the detail line by useAgentTimeline's labelFor), most recent first.
export default function AgentActivityFeed({ userId, logs, onSelect }: Props) {
  const { events, hasActivity } = useRecentActivity(userId, logs);

  if (!hasActivity) {
    return <p className={styles.cardActivityEmpty}>No recent activity.</p>;
  }

  return (
    <div className={styles.cardActivityFeed}>
      {events.map((e) => (
        <button
          key={e.id}
          type="button"
          className={styles.cardActivityRow}
          onClick={() => onSelect?.(e.at.slice(0, 10))}
          title="View this day's timeline"
        >
          <div className={`${styles.cardActivityNode} ${styles['tone' + capitalize(timelineKindTone(e.kind))]}`}>
            {TIMELINE_ICONS[e.kind]}
          </div>
          <div className={styles.cardActivityBody}>
            <div className={styles.cardActivityTop}>
              <span className={styles.cardActivityLabel}>{e.label}</span>
              <span className={styles.cardActivityTime}>{fmtWhen(e.at)}</span>
            </div>
            {e.detail && <div className={styles.cardActivityDetail}>{e.detail}</div>}
          </div>
        </button>
      ))}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
