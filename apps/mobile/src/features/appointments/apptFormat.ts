import type { Appointment } from '@amber-flow/shared';
import { browserTimezone, tzShortLabel } from './tzUtil';

// Mobile copy of desktop's apptFormat helpers (Admin → Appointments format).
// Every date/time is shown in the appointment's OWN timezone (the one picked
// when booking), so it reads as the same date and time on every device.

export function apptTz(a: Appointment): string {
  return a.timezone || browserTimezone();
}

// "YYYY-MM-DD" of the appointment's scheduled date, in its own timezone.
export function apptDayKey(a: Appointment): string {
  if (!a.scheduled_time) return 'Unknown';
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: apptTz(a),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date(a.scheduled_time))
    .forEach(({ type, value }) => {
      parts[type] = value;
    });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function apptTimeLabel(a: Appointment): string {
  if (!a.scheduled_time) return '—';
  return new Date(a.scheduled_time).toLocaleTimeString('en-US', {
    timeZone: apptTz(a),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function apptTzShort(a: Appointment): string {
  return a.scheduled_time ? tzShortLabel(a.scheduled_time, apptTz(a)) : '';
}

export function dayHeading(key: string): string {
  if (key === 'Unknown') return 'Unknown date';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// "Today" / "Tomorrow" / "Yesterday" / "In 5 days" / "3 days ago".
export function relativeDay(key: string): string {
  if (key === 'Unknown') return '';
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

// When the appointment was BOOKED (created_at), in this phone's own clock.
export function bookedLabel(a: Appointment): string {
  if (!a.created_at) return '—';
  const d = new Date(a.created_at);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

// Groups appointments by scheduled day, preserving input order in each group.
export function groupByDay(list: Appointment[]): { key: string; items: Appointment[] }[] {
  const order: string[] = [];
  const map: Record<string, Appointment[]> = {};
  list.forEach((a) => {
    const key = apptDayKey(a);
    if (!map[key]) {
      map[key] = [];
      order.push(key);
    }
    map[key].push(a);
  });
  return order.map((key) => ({ key, items: map[key] }));
}
