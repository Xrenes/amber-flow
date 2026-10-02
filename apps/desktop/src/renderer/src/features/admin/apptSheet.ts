import type { Appointment } from '@amber-flow/shared';
import { apptDayKey, apptTz, dayHeading } from '../appointments/apptFormat';
import { tzShortLabel } from '../appointments/tzUtil';

// The Appointments sheet's columns, and the filter / sort / group-by logic
// behind its header clicks, filter row and View settings. Pure functions, so
// the table component only renders.

export type ColumnKey =
  | 'agent'
  | 'bookedBy'
  | 'account'
  | 'campaign'
  | 'client'
  | 'booked'
  | 'appointment'
  | 'timezone'
  | 'status'
  | 'outcome';

// How a column filters: pick one of its values, match typed text, or pick
// a date range.
export type FilterKind = 'select' | 'text' | 'date';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  filter: FilterKind;
  groupable: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'agent', label: 'Agent', filter: 'select', groupable: true },
  { key: 'bookedBy', label: 'Booked by', filter: 'select', groupable: true },
  { key: 'account', label: 'Account', filter: 'select', groupable: true },
  { key: 'campaign', label: 'Campaign', filter: 'select', groupable: true },
  { key: 'client', label: 'Client', filter: 'text', groupable: false },
  { key: 'booked', label: 'Booked', filter: 'date', groupable: true },
  { key: 'appointment', label: 'Appointment', filter: 'date', groupable: true },
  { key: 'timezone', label: 'Timezone', filter: 'select', groupable: true },
  { key: 'status', label: 'Status', filter: 'select', groupable: true },
  { key: 'outcome', label: 'Outcome', filter: 'select', groupable: true },
];

export const COLUMN_LABEL: Record<ColumnKey, string> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<
  ColumnKey,
  string
>;

const STATUS_TEXT: Record<string, string> = { pending: 'Pending', completed: 'Completed', missed: 'Missed' };
const OUTCOME_TEXT: Record<string, string> = { showed: 'Showed', no_show: 'No-show', uncertain: 'Outcome unknown' };
export const BLANK = '(blank)';

// "YYYY-MM-DD" of an instant on the appointment's own clock.
function dayInTz(iso: string, tz: string): string {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso))
    .forEach(({ type, value }) => {
      p[type] = value;
    });
  return `${p.year}-${p.month}-${p.day}`;
}

// The text a cell shows / filters / groups by.
export function cellText(a: Appointment, col: ColumnKey, profileNames: Record<string, string>): string {
  switch (col) {
    case 'agent':
      return a.agent_name?.trim() || BLANK;
    case 'bookedBy':
      return profileNames[a.user_id] || BLANK;
    case 'account':
      return a.account_name?.trim() || BLANK;
    case 'campaign':
      return a.project_name?.trim() || BLANK;
    case 'client':
      return a.title?.trim() || BLANK;
    case 'booked':
      return a.created_at ? dayInTz(a.created_at, apptTz(a)) : BLANK;
    case 'appointment':
      return a.scheduled_time ? apptDayKey(a) : BLANK;
    case 'timezone':
      return a.scheduled_time ? tzShortLabel(a.scheduled_time, apptTz(a)) || apptTz(a) : BLANK;
    case 'status':
      return STATUS_TEXT[a.status || 'pending'] || a.status;
    case 'outcome':
      return a.show_status ? OUTCOME_TEXT[a.show_status] || a.show_status : BLANK;
  }
}

// Sort value: instants for the date columns, text otherwise.
function sortValue(a: Appointment, col: ColumnKey, profileNames: Record<string, string>): string {
  if (col === 'booked') return a.created_at || '';
  if (col === 'appointment') return a.scheduled_time || '';
  const t = cellText(a, col, profileNames);
  return t === BLANK ? '' : t.toLowerCase();
}

// --- Date range filters --------------------------------------------------

export type DateRange = '' | 'today' | 'tomorrow' | 'yesterday' | 'next7' | 'last7' | 'thisMonth' | 'lastMonth' | 'nextMonth';

export const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'next7', label: 'Next 7 days' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'nextMonth', label: 'Next month' },
];

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// [first, last] day keys (inclusive) for a range, relative to today.
function rangeBounds(range: DateRange): [string, string] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const shift = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return localDayKey(d);
  };
  const monthBounds = (offset: number): [string, string] => {
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1, 12);
    const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0, 12);
    return [localDayKey(first), localDayKey(last)];
  };
  switch (range) {
    case 'today':
      return [shift(0), shift(0)];
    case 'tomorrow':
      return [shift(1), shift(1)];
    case 'yesterday':
      return [shift(-1), shift(-1)];
    case 'next7':
      return [shift(0), shift(6)];
    case 'last7':
      return [shift(-6), shift(0)];
    case 'thisMonth':
      return monthBounds(0);
    case 'lastMonth':
      return monthBounds(-1);
    case 'nextMonth':
      return monthBounds(1);
    default:
      return ['', '9999-99-99'];
  }
}

// --- View state ------------------------------------------------------------

export type SortDir = 'asc' | 'desc';
export type GroupKey = ColumnKey | 'none';

export interface SheetView {
  visible: ColumnKey[];
  sort: { col: ColumnKey; dir: SortDir };
  filters: Partial<Record<ColumnKey, string>>;
  // Up to two columns combined into one group, e.g. Agent + Status.
  groupBy: [GroupKey, GroupKey];
}

export const DEFAULT_VIEW: SheetView = {
  visible: ['agent', 'account', 'booked', 'appointment', 'status'],
  sort: { col: 'appointment', dir: 'desc' },
  filters: {},
  groupBy: ['appointment', 'none'],
};

const STORAGE_KEY = 'amberflow.apptSheetView.v1';

export function loadView(): SheetView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW;
    const v = JSON.parse(raw) as Partial<SheetView>;
    const known = (k: unknown): k is ColumnKey => COLUMNS.some((c) => c.key === k);
    const visible = (v.visible || []).filter(known);
    return {
      visible: visible.length ? visible : DEFAULT_VIEW.visible,
      sort: v.sort && known(v.sort.col) ? v.sort : DEFAULT_VIEW.sort,
      filters: v.filters || {},
      groupBy: [
        v.groupBy?.[0] && (v.groupBy[0] === 'none' || known(v.groupBy[0])) ? v.groupBy[0] : DEFAULT_VIEW.groupBy[0],
        v.groupBy?.[1] && (v.groupBy[1] === 'none' || known(v.groupBy[1])) ? v.groupBy[1] : 'none',
      ],
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: SheetView) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    /* best-effort */
  }
}

// --- Apply -----------------------------------------------------------------

export function applyFilters(
  list: Appointment[],
  filters: SheetView['filters'],
  search: string,
  profileNames: Record<string, string>
): Appointment[] {
  const active = (Object.entries(filters) as [ColumnKey, string][]).filter(([, v]) => v);
  const q = search.trim().toLowerCase();
  return list.filter((a) => {
    for (const [col, value] of active) {
      const def = COLUMNS.find((c) => c.key === col);
      if (!def) continue;
      const text = cellText(a, col, profileNames);
      if (def.filter === 'select' && text !== value) return false;
      if (def.filter === 'text' && !text.toLowerCase().includes(value.toLowerCase())) return false;
      if (def.filter === 'date') {
        const [from, to] = rangeBounds(value as DateRange);
        if (text === BLANK || text < from || text > to) return false;
      }
    }
    if (q) {
      const hay = COLUMNS.map((c) => cellText(a, c.key, profileNames))
        .concat(a.description || '')
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function applySort(
  list: Appointment[],
  sort: SheetView['sort'],
  profileNames: Record<string, string>
): Appointment[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = sortValue(a, sort.col, profileNames);
    const vb = sortValue(b, sort.col, profileNames);
    // Blanks always last, whatever the direction.
    if (!va !== !vb) return va ? -1 : 1;
    const c = va.localeCompare(vb);
    if (c) return c * sign;
    return (b.scheduled_time || '').localeCompare(a.scheduled_time || '');
  });
}

// Distinct values of a column, for its filter dropdown.
export function distinctValues(list: Appointment[], col: ColumnKey, profileNames: Record<string, string>): string[] {
  const set = new Set(list.map((a) => cellText(a, col, profileNames)));
  return [...set].sort((x, y) => (x === BLANK ? 1 : y === BLANK ? -1 : x.localeCompare(y)));
}

export interface SheetGroup {
  key: string;
  // One label per grouped column, e.g. ["Tawsif", "Completed"].
  labels: string[];
  // For a single date group: the "YYYY-MM-DD" day, for Today/Tomorrow tags.
  day: string | null;
  items: Appointment[];
}

function groupLabel(col: ColumnKey, text: string): string {
  if ((col === 'booked' || col === 'appointment') && text !== BLANK) return dayHeading(text);
  return text;
}

// Groups the (already sorted) list by one column or two combined. Date
// groups follow the sort direction when sorted by that date, newest first
// otherwise; text groups are alphabetical, blanks last.
export function applyGroups(
  list: Appointment[],
  view: SheetView,
  profileNames: Record<string, string>
): SheetGroup[] | null {
  const cols = view.groupBy.filter((g): g is ColumnKey => g !== 'none');
  if (!cols.length) return null;

  const map = new Map<string, SheetGroup>();
  list.forEach((a) => {
    const texts = cols.map((c) => cellText(a, c, profileNames));
    const key = texts.join('\u0000');
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        labels: texts.map((t, i) => groupLabel(cols[i], t)),
        day: cols.length === 1 && (cols[0] === 'booked' || cols[0] === 'appointment') && texts[0] !== BLANK ? texts[0] : null,
        items: [],
      };
      map.set(key, g);
    }
    g.items.push(a);
  });

  const parts = (g: SheetGroup) => g.key.split('\u0000');
  return [...map.values()].sort((x, y) => {
    const px = parts(x);
    const py = parts(y);
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (px[i] === py[i]) continue;
      if (px[i] === BLANK) return 1;
      if (py[i] === BLANK) return -1;
      const isDate = col === 'booked' || col === 'appointment';
      const dir = isDate ? (view.sort.col === col && view.sort.dir === 'asc' ? 1 : -1) : 1;
      return px[i].localeCompare(py[i]) * dir;
    }
    return 0;
  });
}

// Count summary shown on each group header.
export function groupSummary(items: Appointment[]): string {
  let completed = 0;
  let missed = 0;
  let pending = 0;
  let showed = 0;
  items.forEach((a) => {
    if (a.status === 'completed') completed++;
    else if (a.status === 'missed') missed++;
    else pending++;
    if (a.show_status === 'showed') showed++;
  });
  const bits = [`${items.length} ${items.length === 1 ? 'appointment' : 'appointments'}`];
  if (pending) bits.push(`${pending} pending`);
  if (completed) bits.push(`${completed} completed`);
  if (missed) bits.push(`${missed} missed`);
  if (showed) bits.push(`${showed} showed`);
  return bits.join(' · ');
}
