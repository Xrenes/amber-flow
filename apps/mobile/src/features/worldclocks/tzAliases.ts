// Ported verbatim from app.js's TZ_ALIASES / TZ_ABBR_FOR (lines ~964-1034).
// Maps common abbreviations (and plain names) -> IANA timezone.
export const TZ_ALIASES: Record<string, string> = {
  // US standard / daylight
  EST: 'America/New_York',
  EDT: 'America/New_York',
  ET: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  AKST: 'America/Anchorage',
  AKDT: 'America/Anchorage',
  AKT: 'America/Anchorage',
  HST: 'Pacific/Honolulu',
  HAST: 'Pacific/Honolulu',
  AST: 'America/Halifax',
  ADT: 'America/Halifax',
  NST: 'America/St_Johns',
  NDT: 'America/St_Johns',
  // Europe
  GMT: 'Europe/London',
  BST: 'Europe/London',
  WET: 'Europe/Lisbon',
  CET: 'Europe/Paris',
  CEST: 'Europe/Paris',
  EET: 'Europe/Helsinki',
  EEST: 'Europe/Helsinki',
  MSK: 'Europe/Moscow',
  // Middle East / Asia
  IST: 'Asia/Kolkata',
  PKT: 'Asia/Karachi',
  GST: 'Asia/Dubai',
  'AST+3': 'Asia/Riyadh',
  'BST+6': 'Asia/Dhaka',
  ICT: 'Asia/Bangkok',
  WIB: 'Asia/Jakarta',
  SGT: 'Asia/Singapore',
  MYT: 'Asia/Kuala_Lumpur',
  'CST+8': 'Asia/Shanghai',
  HKT: 'Asia/Hong_Kong',
  JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul',
  // Australia / Pacific
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  ACST: 'Australia/Adelaide',
  ACDT: 'Australia/Adelaide',
  AWST: 'Australia/Perth',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',
  // Africa
  WAT: 'Africa/Lagos',
  CAT: 'Africa/Harare',
  EAT: 'Africa/Nairobi',
  SAST: 'Africa/Johannesburg',
  // Other
  UTC: 'UTC',
  Z: 'UTC',
};

// Reverse map: IANA -> [abbr, abbr, ...] (skips "+"-suffixed synthetic keys).
export const TZ_ABBR_FOR: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  Object.entries(TZ_ALIASES).forEach(([abbr, iana]) => {
    if (!out[iana]) out[iana] = [];
    if (!abbr.includes('+')) out[iana].push(abbr);
  });
  return out;
})();

export const FALLBACK_TZ_LIST = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul',
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi', 'Asia/Riyadh',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland',
];

export function allTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      /* fall through */
    }
  }
  return FALLBACK_TZ_LIST;
}

export function tzOffset(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch {
    return '';
  }
}

export function tzLabel(tz: string): { city: string; region: string } {
  const parts = tz.split('/');
  const city = (parts[parts.length - 1] || tz).replace(/_/g, ' ');
  const region = parts.length > 1 ? parts.slice(0, -1).join('/').replace(/_/g, ' ') : '';
  return { city, region };
}

// Live abbreviation (e.g. "PST", "EDT") for the timezone right now.
export function currentAbbr(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch {
    return '';
  }
}
