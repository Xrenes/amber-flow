// Generic import/export engine shared by every data type Amber Flow lets
// admin bulk-import from or export to a spreadsheet (Appointments, Time
// Sessions, Agent Goals — and any future table). One field-schema
// descriptor per table drives both directions: export reads it to build
// column headers, import reads it to power the column-mapping UI and to
// validate/convert each uploaded cell.
//
// Deliberately NOT tied to any specific file format (xlsx/csv) or to
// Electron — that parsing lives in the desktop app, which is the only
// place with a filesystem/file-picker today. This module only knows about
// plain JS objects (rows in, rows out).

export type ImportExportDataType = 'appointments' | 'timeSessions' | 'agentGoals';

export type FieldKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'timezone'
  | 'rowId'
  | 'enum'
  | 'agentRef'
  | 'agentName'
  | 'campaignRef';

export interface FieldSchema {
  /** Column key in the app's own row shape (e.g. 'title', 'scheduled_time'). */
  key: string;
  /** Human label shown in the export header and the import mapping UI. */
  label: string;
  kind: FieldKind;
  required: boolean;
  /** For kind: 'enum' — the allowed values, shown as a hint in the mapping UI. */
  enumValues?: string[];
  /** One-line hint shown next to the field in the mapping UI (format, example). */
  hint?: string;
  /** For kind: 'datetime' — the row field holding the IANA timezone the
   *  wall-clock time is in (blank cell = the importer's own timezone). */
  tzField?: string;
}

// The row's ID: blank for a new row; kept from an export, the import
// updates that existing row instead of adding a duplicate.
const ID_FIELD: FieldSchema = {
  key: 'id',
  label: 'ID',
  kind: 'rowId',
  required: false,
  hint: 'Keep from an export to update that row; blank = new row',
};

export const APPOINTMENT_FIELDS: FieldSchema[] = [
  ID_FIELD,
  { key: 'title', label: 'Title', kind: 'text', required: true },
  { key: 'description', label: 'Description', kind: 'text', required: false },
  {
    key: 'scheduled_time',
    label: 'Scheduled Time',
    kind: 'datetime',
    required: true,
    hint: 'YYYY-MM-DD HH:MM, in the Timezone column',
    tzField: 'timezone',
  },
  {
    key: 'timezone',
    label: 'Timezone',
    kind: 'timezone',
    required: false,
    hint: 'e.g. America/New_York; blank = your computer’s',
  },
  { key: 'reminder_minutes', label: 'Reminder (minutes before)', kind: 'number', required: false },
  {
    key: 'status',
    label: 'Status',
    kind: 'enum',
    required: false,
    enumValues: ['pending', 'completed', 'missed'],
  },
  {
    key: 'show_status',
    label: 'Show Status',
    kind: 'enum',
    required: false,
    enumValues: ['showed', 'no_show', 'uncertain'],
  },
  { key: 'account_name', label: 'Account', kind: 'text', required: false },
  { key: 'project_name', label: 'Campaign', kind: 'campaignRef', required: true },
  { key: 'agent_name', label: 'Agent', kind: 'agentName', required: true, hint: 'Any name from the Agent list' },
  {
    key: 'created_at',
    label: 'Booked At',
    kind: 'datetime',
    required: false,
    hint: 'When it was booked, in the Timezone column; blank = now',
    tzField: 'timezone',
  },
];

export const TIME_SESSION_FIELDS: FieldSchema[] = [
  ID_FIELD,
  { key: 'project_name', label: 'Campaign', kind: 'campaignRef', required: true },
  { key: 'start_time', label: 'Start Time', kind: 'datetime', required: true, hint: 'YYYY-MM-DD HH:MM, your time' },
  { key: 'end_time', label: 'End Time', kind: 'datetime', required: false, hint: 'YYYY-MM-DD HH:MM, your time' },
  { key: 'duration_seconds', label: 'Duration (seconds)', kind: 'number', required: false },
  { key: 'agent_name', label: 'Agent', kind: 'agentName', required: true, hint: 'Any name from the Agent list' },
];

export const AGENT_GOAL_FIELDS: FieldSchema[] = [
  { key: 'agent_name', label: 'Agent (blank = everyone)', kind: 'agentName', required: false },
  { key: 'campaign_name', label: 'Campaign (blank = any)', kind: 'campaignRef', required: false },
  { key: 'daily_appointment_goal', label: 'Daily Appointment Goal', kind: 'number', required: true },
  { key: 'daily_show_goal', label: 'Daily Show Goal', kind: 'number', required: true },
];

export const FIELD_SCHEMAS: Record<ImportExportDataType, FieldSchema[]> = {
  appointments: APPOINTMENT_FIELDS,
  timeSessions: TIME_SESSION_FIELDS,
  agentGoals: AGENT_GOAL_FIELDS,
};

export const DATA_TYPE_LABELS: Record<ImportExportDataType, string> = {
  appointments: 'Appointments',
  timeSessions: 'Time Sessions',
  agentGoals: 'Agent Goals',
};

// A resolved, validated row ready to write to the database — or, if
// `error` is set, a row that failed validation/resolution and will be
// skipped, carrying the specific reason for the import summary.
export interface ResolvedImportRow {
  rowNumber: number; // 1-based, matches the spreadsheet row the user sees
  values: Record<string, unknown>;
  error: string | null;
}

export interface AgentLookup {
  /** Case-insensitive match against profile name. */
  byName: Map<string, string>; // lowercased name -> user_id
}

export function buildAgentLookup(profiles: { id: string; name: string }[]): AgentLookup {
  const byName = new Map<string, string>();
  profiles.forEach((p) => {
    if (p.name) byName.set(p.name.trim().toLowerCase(), p.id);
  });
  return { byName };
}

// --- Wall-clock time in an IANA timezone <-> UTC (Intl only, no library) ---

function zonedParts(date: Date, tz: string): Record<string, number> {
  const parts: Record<string, number> = {};
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
    .formatToParts(date)
    .forEach(({ type, value }) => {
      if (type !== 'literal') parts[type] = parseInt(value, 10);
    });
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// "YYYY-MM-DDTHH:MM" as read on a clock in `tz` -> UTC ISO string.
export function wallTimeToUTC(wall: string, tz: string): string {
  const [datePart, timePart = '00:00'] = wall.split('T');
  const [yr, mo, dy] = datePart.split('-').map(Number);
  const [hr, mn] = timePart.split(':').map(Number);
  const guess = Date.UTC(yr, mo - 1, dy, hr, mn, 0);
  // tz's UTC offset at instant t (ms). Re-checked at the result, since the
  // offset at the first guess can differ near a daylight-saving switch.
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first)).toISOString();
}

// UTC ISO -> "YYYY-MM-DD HH:MM" as read on a clock in `tz` (export format).
export function utcToWallTime(iso: string, tz: string): string {
  const p = zonedParts(new Date(iso), tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

// A spreadsheet date cell -> "YYYY-MM-DDTHH:MM" wall time, or an exact
// instant when the text carries its own offset ("…Z", "+06:00").
function readDateCell(cell: unknown): { wall: string } | { iso: string } | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fromLocalDate = (d: Date) => ({
    wall: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
  });
  // Spreadsheet date cells arrive as Dates holding the cell's clock time.
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : fromLocalDate(cell);
  const s = String(cell).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?(?::\d{2}(?:\.\d+)?)?$/);
  if (m) return { wall: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}T${pad(+(m[4] || 0))}:${m[5] || '00'}` };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? { iso: d.toISOString() } : fromLocalDate(d);
}

function coerceBoolean(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

// Parses one uploaded row (already re-keyed by the column mapping — see the
// desktop mapping UI) into the app's row shape, resolving agent/campaign
// references and validating required fields + enum values. Returns an
// error string (never throws) so the caller can show a per-row skip reason.
export function resolveImportRow(
  rowNumber: number,
  raw: Record<string, unknown>,
  fields: FieldSchema[],
  agents: AgentLookup,
  campaigns: Set<string>, // lowercased existing campaign names
  defaultTz: string // the importer's own timezone, for blank Timezone cells
): ResolvedImportRow {
  const values: Record<string, unknown> = {};

  // Timezones first: datetime fields are read on the clock of their row's
  // timezone column.
  const rowTz: Record<string, string> = {};
  for (const field of fields) {
    if (field.kind !== 'timezone') continue;
    const tz = String(raw[field.key] ?? '').trim();
    if (tz && !isValidTimezone(tz)) {
      return { rowNumber, values, error: `"${field.label}" is not a timezone: "${tz}" (e.g. America/New_York)` };
    }
    rowTz[field.key] = tz || defaultTz;
  }

  for (const field of fields) {
    if (field.kind === 'timezone') {
      values[field.key] = rowTz[field.key]; // blank cell = the importer's timezone
      continue;
    }
    const cell = raw[field.key];
    const isEmpty = cell === undefined || cell === null || String(cell).trim() === '';

    if (isEmpty) {
      if (field.required) {
        return { rowNumber, values, error: `Missing required "${field.label}"` };
      }
      values[field.key] = null;
      continue;
    }

    switch (field.kind) {
      case 'text':
        values[field.key] = String(cell).trim();
        break;
      case 'number': {
        const n = coerceNumber(cell);
        if (n === null) return { rowNumber, values, error: `"${field.label}" is not a number: "${cell}"` };
        values[field.key] = n;
        break;
      }
      case 'boolean':
        values[field.key] = coerceBoolean(cell);
        break;
      case 'date': {
        const d = new Date(String(cell));
        if (Number.isNaN(d.getTime())) return { rowNumber, values, error: `"${field.label}" is not a valid date: "${cell}"` };
        values[field.key] = String(cell).trim();
        break;
      }
      case 'datetime': {
        const read = readDateCell(cell);
        if (!read) return { rowNumber, values, error: `"${field.label}" is not a valid date: "${cell}"` };
        const tz = (field.tzField && rowTz[field.tzField]) || defaultTz;
        values[field.key] = 'iso' in read ? read.iso : wallTimeToUTC(read.wall, tz);
        break;
      }
      case 'enum': {
        const s = String(cell).trim();
        if (field.enumValues && !field.enumValues.includes(s)) {
          return { rowNumber, values, error: `"${field.label}" must be one of ${field.enumValues.join('/')}, got "${s}"` };
        }
        values[field.key] = s;
        break;
      }
      case 'agentRef': {
        const name = String(cell).trim();
        const userId = agents.byName.get(name.toLowerCase());
        if (!userId) return { rowNumber, values, error: `No agent named "${name}"` };
        values[field.key] = name;
        values.__agentUserId = userId;
        break;
      }
      case 'rowId': {
        const id = String(cell).trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return { rowNumber, values, error: `"${field.label}" must be an ID from an Amber Flow export, got "${id}"` };
        }
        values[field.key] = id.toLowerCase();
        break;
      }
      case 'agentName': {
        // Any agent name (the Field Options Agent list, or a teammate's
        // name). The row is saved under that teammate's login when there
        // is one, otherwise under whoever is importing.
        const name = String(cell).trim();
        values[field.key] = name;
        values.__agentUserId = agents.byName.get(name.toLowerCase()) ?? null;
        break;
      }
      case 'campaignRef': {
        const name = String(cell).trim();
        if (!campaigns.has(name.toLowerCase())) {
          return { rowNumber, values, error: `No campaign named "${name}" — add it in Field Options first` };
        }
        values[field.key] = name;
        break;
      }
    }
  }

  return { rowNumber, values, error: null };
}
