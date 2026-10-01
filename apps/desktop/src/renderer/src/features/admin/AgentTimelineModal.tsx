import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityLog, Profile, TimeSession } from '@amber-flow/shared';
import { useAgentTimeline, dayKeyFor, type TimelineEventKind } from './useAgentTimeline';
import { TIMELINE_ICONS, timelineKindTone } from './timelineIcons';
import styles from './AgentTimelineModal.module.css';

interface Props {
  profile: Profile;
  logs: ActivityLog[];
  sessions: TimeSession[];
  onClose: () => void;
  // Opens directly scoped to this day (e.g. when jumping in from clicking a
  // specific activity entry on the Overview card) instead of today.
  initialDate?: string;
}

const DAYS_BACK = 45;

const TONE_CLASS: Record<ReturnType<typeof timelineKindTone>, string> = {
  success: styles.nodeSuccess,
  danger: styles.nodeDanger,
  amber: styles.nodeAmber,
  neutral: styles.nodeNeutral,
};

function kindClass(kind: TimelineEventKind): string {
  return TONE_CLASS[timelineKindTone(kind)];
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function initials(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// A day-by-day story of one agent's activity, opened from their card on the
// Overview tab. The vertical spine is the one deliberate visual idea here:
// its "work" segments (drawn from time_sessions) render solid and glowing,
// everything else (breaks, gaps, before login/after logout) renders as a
// thin dashed line — so the shape of the spine alone shows how much of the
// day was actually spent working, before reading a single label.
export default function AgentTimelineModal({ profile, logs, sessions, onClose, initialDate }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => initialDate || dayKeyFor(new Date().toISOString()));
  const strip = useMemo(() => {
    const days: { key: string; label: string; weekday: string; hasActivity: boolean }[] = [];
    const activeDays = new Set(
      [...logs.filter((l) => l.user_id === profile.id && l.created_at).map((l) => dayKeyFor(l.created_at as string)),
       ...sessions.filter((s) => s.user_id === profile.id && s.start_time).map((s) => dayKeyFor(s.start_time))]
    );
    for (let i = DAYS_BACK; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKeyFor(d.toISOString());
      days.push({
        key,
        label: String(d.getDate()),
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
        hasActivity: activeDays.has(key),
      });
    }
    return days;
  }, [logs, sessions, profile.id]);

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Today is the rightmost chip (DAYS_BACK ... 0) — scroll it into view on
    // open instead of leaving the strip at its default leftmost position,
    // which would hide today off-screen. If opened scoped to a specific past
    // day (initialDate), scroll that chip into view instead.
    if (initialDate) {
      const el = stripRef.current?.querySelector<HTMLButtonElement>(`[data-day="${initialDate}"]`);
      el?.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else {
      stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth });
    }
    // Only on open — the strip shouldn't re-jump every time selectedDate changes via clicking a chip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { events, segments, totalSeconds, hasActivity } = useAgentTimeline(profile.id, selectedDate, logs, sessions);

  const selectedLabel = useMemo(
    () => new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [selectedDate]
  );

  // Each event renders in normal document flow (stacked top-to-bottom, real
  // chronological order — no overlap risk even when two events are seconds
  // apart). The spine's solid "work" bars are positioned by percentage
  // against the full day span behind that flow, so the ONE thing that needs
  // true-to-scale proportion (how much of the day was tracked work vs. not)
  // gets it, without forcing every event card into fragile absolute
  // positioning too.
  const daySpan = useMemo(() => {
    if (events.length === 0) return null;
    const allTimes = [
      ...events.map((e) => new Date(e.at).getTime()),
      ...segments.flatMap((s) => [new Date(s.start).getTime(), new Date(s.end).getTime()]),
    ];
    const startMs = Math.min(...allTimes);
    const endMs = Math.max(...allTimes);
    return { startMs, span: Math.max(endMs - startMs, 60_000) };
  }, [events, segments]);

  const segmentBars = useMemo(() => {
    if (!daySpan) return [];
    return segments.map((s, i) => {
      const startPct = ((new Date(s.start).getTime() - daySpan.startMs) / daySpan.span) * 100;
      const endPct = ((new Date(s.end).getTime() - daySpan.startMs) / daySpan.span) * 100;
      return { key: `seg-${i}`, top: startPct, height: Math.max(endPct - startPct, 0.6) };
    });
  }, [segments, daySpan]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>{initials(profile.name)}</div>
            <div>
              <div className={styles.agentName}>{profile.name || 'Unknown'}</div>
              <div className={styles.selectedDateLabel}>{selectedLabel}</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.calendarStrip} ref={stripRef}>
          {strip.map((d) => (
            <button
              key={d.key}
              data-day={d.key}
              className={`${styles.dayChip} ${d.key === selectedDate ? styles.dayChipActive : ''} ${!d.hasActivity ? styles.dayChipEmpty : ''}`}
              onClick={() => setSelectedDate(d.key)}
            >
              <span className={styles.dayChipWeekday}>{d.weekday}</span>
              <span className={styles.dayChipNum}>{d.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {!hasActivity ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <p>No activity recorded for this day.</p>
            </div>
          ) : (
            <div className={styles.timelineWrap}>
              <div className={styles.spineTrack}>
                <div className={styles.spineDashed} />
                {segmentBars.map((bar) => (
                  <div
                    key={bar.key}
                    className={styles.spineSolid}
                    style={{ top: `${bar.top}%`, height: `${bar.height}%` }}
                  />
                ))}
              </div>
              <div className={styles.eventsCol}>
                {events.map((e) => (
                  <div key={e.id} className={styles.eventRow}>
                    <div className={`${styles.node} ${kindClass(e.kind)}`}>{TIMELINE_ICONS[e.kind]}</div>
                    <div className={styles.eventCard}>
                      <div className={styles.eventTop}>
                        <span className={styles.eventLabel}>{e.label}</span>
                        <span className={styles.eventTime}>{fmtClock(e.at)}</span>
                      </div>
                      {e.detail && <div className={styles.eventDetail}>{e.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasActivity && (
          <div className={styles.footer}>
            <span className={styles.footerLabel}>Tracked today</span>
            <span className={styles.footerVal}>{fmtHours(totalSeconds)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
