import { useMemo } from 'react';
import type { ActivityLog } from '@amber-flow/shared';
import { ACTION_TO_KIND, labelFor, type TimelineEvent } from './useAgentTimeline';

const RECENT_LIMIT = 8;

// A flat, most-recent-first activity feed for one agent — unlike
// useAgentTimeline (which scopes to a single calendar day for the Timeline
// modal's spine view), this just takes the last N events regardless of day,
// for the compact feed embedded in each Overview card.
export function useRecentActivity(userId: string, logs: ActivityLog[], limit = RECENT_LIMIT) {
  return useMemo(() => {
    const userLogs = logs
      .filter((l) => l.user_id === userId && l.created_at)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    // isFirstLogin needs chronological (oldest-first) scanning per day, so
    // compute it against the ascending order, then take the most recent N
    // for display.
    const ascending = [...userLogs].reverse();
    const seenLoginDays = new Set<string>();
    const events: TimelineEvent[] = ascending.map((log, idx) => {
      const kind = ACTION_TO_KIND[log.action_type];
      const dayKey = (log.created_at as string).slice(0, 10);
      const isFirstLogin = log.action_type === 'START_TRACKER' && !seenLoginDays.has(dayKey);
      if (isFirstLogin) seenLoginDays.add(dayKey);
      const { label, detail } = labelFor(log, isFirstLogin);
      return {
        id: log.id || `${log.action_type}-${idx}`,
        kind: kind ? (isFirstLogin ? 'login' : kind) : 'status',
        at: log.created_at as string,
        label,
        detail,
      };
    });

    const recent = [...events].reverse().slice(0, limit);
    return { events: recent, hasActivity: recent.length > 0 };
  }, [userId, logs, limit]);
}
