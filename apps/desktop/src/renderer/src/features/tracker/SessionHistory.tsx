import React, { useMemo } from 'react';
import { formatMs, formatMsHM, todayKey, type TrackerSession } from './useTimeTracker';
import styles from './SessionHistory.module.css';

interface SessionHistoryProps {
  sessions: TrackerSession[];
}

// Port of app.js's formatDayLabel: Today / Yesterday / short weekday date.
export function formatDayLabel(dateStr: string): string {
  const today = todayKey();
  if (dateStr === today) return 'Today';
  const d = new Date(dateStr + 'T00:00:00');
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yKey = todayKey(yest);
  if (dateStr === yKey) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

interface ProjectGroup {
  name: string;
  total: number;
  sessions: TrackerSession[];
}

// Port of app.js's renderSessionHistory: group sessions by day, then by
// project (case-insensitive key, first-seen casing kept), sorted by time
// spent, with individual session rows sorted most-recent-first.
export default function SessionHistory({ sessions }: SessionHistoryProps) {
  const dayGroups = useMemo(() => {
    const byDate: Record<string, TrackerSession[]> = {};
    sessions.forEach((s) => {
      (byDate[s.date] = byDate[s.date] || []).push(s);
    });
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    return dates.map((date) => {
      const list = byDate[date];
      const dayMs = list.reduce((a, s) => a + (s.duration || 0), 0);
      const projMap = new Map<string, ProjectGroup>();
      list.forEach((s) => {
        const key = (s.project || '').trim().toLowerCase();
        if (!projMap.has(key)) projMap.set(key, { name: s.project, total: 0, sessions: [] });
        const p = projMap.get(key)!;
        p.total += s.duration || 0;
        p.sessions.push(s);
      });
      const projects = [...projMap.values()].sort((a, b) => b.total - a.total);
      return { date, dayMs, projects };
    });
  }, [sessions]);

  if (!sessions.length) {
    return <p className={styles.empty}>No sessions recorded yet.</p>;
  }

  return (
    <div>
      {dayGroups.map(({ date, dayMs, projects }) => (
        <div key={date} className={styles.dayGroup}>
          <div className={styles.dayHeader}>
            <span className={styles.dayDuration}>{formatMsHM(dayMs)}</span>
            <span className={styles.dayName}>{formatDayLabel(date)}</span>
          </div>
          {projects.map((p) => (
            <div key={p.name.toLowerCase()} className={styles.projectBlock}>
              <div className={styles.projectHead}>
                <span className={styles.projectDot} />
                <span className={styles.projectName}>{p.name}</span>
                <span className={styles.projectTime}>{formatMsHM(p.total)}</span>
              </div>
              <div className={styles.projectSessions}>
                {p.sessions
                  .slice()
                  .sort((a, b) => b.start - a.start)
                  .map((s) => {
                    const t1 = new Date(s.start).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                    const t2 = new Date(s.end).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                    return (
                      <div key={s.id} className={styles.sessionRow}>
                        <span className={styles.sessionDuration}>{formatMs(s.duration || 0)}</span>
                        <span className={styles.sessionTimes}>
                          {t1} – {t2}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
