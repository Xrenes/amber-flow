// Timezone conversion helpers ported faithfully from app.js (_tzLocalToUTC /
// _utcToTZLocal / _apptFmtLocal). Appointments are stored as UTC ISO strings,
// but the user picks a wall-clock local time in a specific IANA timezone —
// these helpers convert both directions using Intl.DateTimeFormat's
// timeZone-aware formatting rather than any timezone library.

// Convert "YYYY-MM-DDTHH:MM" (wall-clock in tz) -> UTC ISO string.
export function tzLocalToUTC(localStr: string, tz: string): string {
  const [datePart, timePart] = localStr.split('T');
  const [yr, mo, dy] = datePart.split('-').map(Number);
  const [hr, mn] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(yr, mo - 1, dy, hr, mn, 0);

  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })
    .formatToParts(new Date(utcGuess))
    .forEach(({ type, value }) => {
      parts[type] = value;
    });

  const h = parseInt(parts.hour, 10) === 24 ? 0 : parseInt(parts.hour, 10);
  const tzAsUTC = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    h,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10)
  );
  return new Date(utcGuess + (utcGuess - tzAsUTC)).toISOString();
}

// Convert UTC ISO -> "YYYY-MM-DDTHH:MM" in a given timezone (for datetime-local input).
export function utcToTZLocal(isoStr: string, tz: string): string {
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date(isoStr))
    .forEach(({ type, value }) => {
      parts[type] = value;
    });
  const h = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}`;
}

// Format a Date as "YYYY-MM-DDTHH:MM" using its *local* (browser) wall-clock
// fields (app.js's _apptFmtLocal — used to seed "now" into the datetime-local input).
export function apptFmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// List of IANA timezones for the <select>, falling back to a curated list
// when Intl.supportedValuesOf isn't available (ported from _populateTZSelect).
export function listTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      /* fall through to static list */
    }
  }
  return [
    'Pacific/Honolulu',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Halifax',
    'America/Sao_Paulo',
    'Atlantic/Azores',
    'Europe/London',
    'Europe/Paris',
    'Europe/Helsinki',
    'Europe/Moscow',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Dhaka',
    'Asia/Bangkok',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Format a UTC ISO scheduled time for display in a given timezone, matching
// renderAppointments()'s dtStr (e.g. "Mon, Jan 5, 2:30 PM").
export function apptFmtDisplay(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Short timezone abbreviation (e.g. "EST") for the tz badge on appointment cards.
export function tzShortLabel(isoStr: string, tz: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(isoStr))
      .find((p) => p.type === 'timeZoneName')?.value || ''
  );
}
