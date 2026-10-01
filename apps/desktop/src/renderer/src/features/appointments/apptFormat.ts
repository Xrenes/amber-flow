import type { Appointment } from '@amber-flow/shared';
import { browserTimezone, tzShortLabel } from './tzUtil';

// Display helpers shared by Admin → Appointments and the agent's My Reports
// list. Every date/time is shown in the appointment's OWN timezone (the one
// picked when booking), so an appointment reads as the same date and time
// for everyone, regardless of the viewer's computer clock.

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
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
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

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

// Groups appointments by their scheduled day, preserving the input order
// inside each group (so callers sort first).
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

// When the appointment was BOOKED (created_at), in the appointment's own
// timezone — e.g. "Oct 1, 2:26 PM EDT" — so every viewer sees the same
// booked date, whatever their computer's timezone.
export function bookedLabel(a: Appointment): string {
  if (!a.created_at) return '—';
  const zone = apptTz(a);
  const d = new Date(a.created_at);
  const year = (x: Date) => x.toLocaleDateString('en-US', { timeZone: zone, year: 'numeric' });
  const sameYear = year(d) === year(new Date());
  const date = d.toLocaleDateString('en-US', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const time = d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true });
  const tz = tzShortLabel(a.created_at, zone);
  return `${date}, ${time}${tz ? ` ${tz}` : ''}`;
}

// "Thu, Oct 22 · 2:26 AM MDT" — the full scheduled moment in its own timezone.
export function apptWhenLabel(scheduledIso: string, tz?: string | null): string {
  const zone = tz || browserTimezone();
  const d = new Date(scheduledIso);
  const date = d.toLocaleDateString('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true });
  const short = tzShortLabel(scheduledIso, zone);
  return `${date}, ${time}${short ? ` ${short}` : ''}`;
}
