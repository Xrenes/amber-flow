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

export type FieldKind = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'agentRef' | 'campaignRef';

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
}

export const APPOINTMENT_FIELDS: FieldSchema[] = [
  { key: 'title', label: 'Title', kind: 'text', required: true },
  { key: 'description', label: 'Description', kind: 'text', required: false },
  { key: 'scheduled_time', label: 'Scheduled Time', kind: 'datetime', required: true, hint: 'YYYY-MM-DD HH:MM' },
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
  { key: 'agent_name', label: 'Agent', kind: 'agentRef', required: true },
];

export const TIME_SESSION_FIELDS: FieldSchema[] = [
  { key: 'project_name', label: 'Campaign', kind: 'campaignRef', required: true },
  { key: 'start_time', label: 'Start Time', kind: 'datetime', required: true, hint: 'YYYY-MM-DD HH:MM' },
  { key: 'end_time', label: 'End Time', kind: 'datetime', required: false, hint: 'YYYY-MM-DD HH:MM' },
  { key: 'duration_seconds', label: 'Duration (seconds)', kind: 'number', required: false },
  { key: 'agent_name', label: 'Agent', kind: 'agentRef', required: true },
];

export const AGENT_GOAL_FIELDS: FieldSchema[] = [
  { key: 'agent_name', label: 'Agent (blank = everyone)', kind: 'agentRef', required: false },
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
  campaigns: Set<string> // lowercased existing campaign names
): ResolvedImportRow {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
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
      case 'date':
      case 'datetime': {
        const d = new Date(String(cell));
        if (Number.isNaN(d.getTime())) return { rowNumber, values, error: `"${field.label}" is not a valid date: "${cell}"` };
        values[field.key] = field.kind === 'date' ? String(cell).trim() : d.toISOString();
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
