import React from 'react';
import type { TimelineEventKind } from './useAgentTimeline';

// Shared icon set for timeline-style event nodes — used by both the full
// AgentTimelineModal and the compact per-card activity feed on Overview, so
// the same event kind always renders the same glyph everywhere.
export const TIMELINE_ICONS: Record<TimelineEventKind, React.ReactNode> = {
  login: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  break_start: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  break_end: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  task_created: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  // Same calendar glyph as appt_created — COMPLETE_TASK is legacy naming for
  // what is now, functionally, an appointment booking (see useAgentTimeline's
  // labelFor: "Appointment booked").
  task_completed: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  appt_created: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  appt_completed: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 14l2.5 2.5L16 11" />
    </svg>
  ),
  appt_missed: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="9" y1="10" x2="15" y2="16" /><line x1="15" y1="10" x2="9" y2="16" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
};

export function timelineKindTone(kind: TimelineEventKind): 'success' | 'danger' | 'amber' | 'neutral' {
  if (kind === 'login' || kind === 'task_completed' || kind === 'appt_completed') return 'success';
  if (kind === 'logout' || kind === 'appt_missed') return 'danger';
  if (kind === 'break_start' || kind === 'break_end') return 'amber';
  return 'neutral';
}
