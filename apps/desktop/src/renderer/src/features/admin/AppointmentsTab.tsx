import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  appointmentLogMetadata,
  insertActivityLog,
  updateAppointmentFields,
  type Appointment,
  type AppointmentStatus,
  type ShowStatus,
} from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import type { AdminData } from './useAdminData';
import AppointmentDetailCard from '../appointments/AppointmentDetailCard';
import AppointmentModal from '../appointments/AppointmentModal';
import type { NewAppointmentInput } from '../appointments/useAppointments';
import { bookedLabel, apptTimeLabel, apptTz, apptTzShort, initials, relativeDay } from '../appointments/apptFormat';
import {
  BLANK,
  COLUMNS,
  DATE_RANGES,
  applyFilters,
  applyGroups,
  applySort,
  cellText,
  distinctValues,
  groupSummary,
  loadView,
  saveView,
  type ColumnKey,
  type SheetView,
} from './apptSheet';
import SheetViewSettings from './SheetViewSettings';
import styles from './AdminShared.module.css';
import toolbarStyles from './AdminToolbar.module.css';
import apptStyles from './AppointmentsTab.module.css';

interface Props {
  data: AdminData;
  // Reload the list after an edit (realtime also catches it, a bit later).
  onChanged?: () => void;
}

// Single click opens the detail card; a double click opens the edit form
// instead, so the first click's card is held back until this has passed.
const DOUBLE_CLICK_MS = 250;

type ApptFilter = 'all' | 'pending' | 'completed' | 'missed';

// Status dropdown choices: "status|outcome" (outcome only for completed).
const STATUS_CHOICES: { value: string; label: string }[] = [
  { value: 'pending|', label: 'Pending' },
  { value: 'completed|showed', label: 'Showed' },
  { value: 'completed|no_show', label: 'No-show' },
  { value: 'completed|uncertain', label: 'Unknown' },
];

function statusChoice(a: Appointment): string {
  const st = a.status || 'pending';
  // "Missed" isn't a choice anymore — it's the same as a no-show.
  if (st === 'missed') return 'completed|no_show';
  return st === 'completed' ? `completed|${a.show_status || 'uncertain'}` : `${st}|`;
}

// Dropdown colour follows the outcome: showed green, no-show red, else amber.
function outcomeTone(a: Appointment): string {
  const c = statusChoice(a);
  return c === 'completed|showed' ? 'completed' : c === 'completed|no_show' ? 'missed' : 'pending';
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  missed: 'Missed',
};

// The Appointments sheet (Reports and Admin): a summary strip (click a
// segment to filter by status), search, sortable column headers, a filter
// row under them, and View settings to pick columns and group rows by one
// column or two combined. Dates show in each appointment's own timezone.
// The view is remembered in this browser.
export default function AppointmentsTab({ data, onChanged }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<SheetView>(loadView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => saveView(view), [view]);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { appointments, profileMap } = data;

  // Same rule as RLS (appt_update_own_or_manager): your own bookings, or
  // anyone's if you're an admin/manager.
  // Same office: anyone signed in can set any appointment's status/outcome.
  const canSetStatus = (_a: Appointment) => !!user;
  const canEdit = (a: Appointment) =>
    !!user && (user.role === 'admin' || user.role === 'manager' || a.user_id === user.id);

  function handleRowClick(a: Appointment) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => setDetail(a), canEdit(a) ? DOUBLE_CLICK_MS : 0);
  }

  function handleRowDoubleClick(a: Appointment) {
    if (!canEdit(a)) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    setDetail(null);
    setEditError(null);
    setEditing(a);
  }

  async function handleEditSave(input: NewAppointmentInput) {
    if (!editing || !user) return;
    const fields = {
      project_name: input.projectName,
      title: input.title,
      description: input.description || '',
      scheduled_time: input.scheduledTime,
      timezone: input.timezone,
      reminder_minutes: input.reminderMinutes,
      account_name: input.accountName || null,
      agent_name: input.agentName || null,
    };
    const { error } = await updateAppointmentFields(editing.id, fields);
    if (error) {
      setEditError(`Couldn't update appointment: ${error.message}`);
      return;
    }
    setEditError(null);
    insertActivityLog(user.id, 'UPDATE_APPOINTMENT', appointmentLogMetadata({ ...editing, ...fields })).catch(() => {});
    onChanged?.();
  }

  async function handleStatusChange(a: Appointment, choice: string) {
    if (!user) return;
    const [status, outcome] = choice.split('|') as [AppointmentStatus, string];
    const fields = { status, show_status: status === 'completed' ? ((outcome || 'uncertain') as ShowStatus) : null };
    const { error } = await updateAppointmentFields(a.id, fields);
    if (error) {
      setEditError(`Couldn't change status: ${error.message}`);
      return;
    }
    setEditError(null);
    const action =
      status === 'completed' ? 'COMPLETE_APPOINTMENT' : status === 'missed' ? 'MISS_APPOINTMENT' : 'UPDATE_APPOINTMENT';
    insertActivityLog(user.id, action, appointmentLogMetadata({ ...a, ...fields })).catch(() => {});
    onChanged?.();
  }

  const counts = useMemo(() => {
    const c = { all: appointments.length, pending: 0, completed: 0, missed: 0 };
    appointments.forEach((a) => {
      const st = (a.status || 'pending') as 'pending' | 'completed' | 'missed';
      if (st in c) c[st] += 1;
    });
    return c;
  }, [appointments]);

  // Only appointments with a known outcome count toward the show rate —
  // 'uncertain' (ticked done, outcome not set yet) is neither a show nor a no-show.
  const showed = appointments.filter((a) => a.show_status === 'showed').length;
  const noShow = appointments.filter((a) => a.show_status === 'no_show').length;
  const unknown = appointments.filter((a) => a.show_status === 'uncertain').length;
  const decided = showed + noShow;
  const showRate = decided ? Math.round((showed / decided) * 100) : null;

  const profileNames = useMemo(
    () => Object.fromEntries(Object.entries(profileMap).map(([id, p]) => [id, p?.name || ''])),
    [profileMap]
  );
  const filtered = useMemo(
    () => applySort(applyFilters(appointments, view.filters, search, profileNames), view.sort, profileNames),
    [appointments, view.filters, view.sort, search, profileNames]
  );
  const groups = useMemo(() => applyGroups(filtered, view, profileNames), [filtered, view, profileNames]);
  const visibleCols = COLUMNS.filter((c) => view.visible.includes(c.key));
  const filterCount = Object.values(view.filters).filter(Boolean).length;

  // The summary strip filters the Status column.
  const statusFilter = (view.filters.status || '').toLowerCase();
  const filter: ApptFilter = statusFilter === 'pending' || statusFilter === 'completed' || statusFilter === 'missed' ? statusFilter : 'all';
  const setFilter = (f: ApptFilter) => setColumnFilter('status', f === 'all' ? '' : f[0].toUpperCase() + f.slice(1));

  function setColumnFilter(col: ColumnKey, value: string) {
    setView((v) => ({ ...v, filters: { ...v.filters, [col]: value } }));
  }

  function toggleSort(col: ColumnKey) {
    setView((v) => ({
      ...v,
      sort:
        v.sort.col === col
          ? { col, dir: v.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { col, dir: col === 'booked' || col === 'appointment' ? 'desc' : 'asc' },
    }));
  }

  const segments: { key: ApptFilter; label: string; value: number; tone: string }[] = [
    { key: 'all', label: 'Total', value: counts.all, tone: apptStyles.toneAll },
    { key: 'pending', label: 'Pending', value: counts.pending, tone: apptStyles.tonePending },
    { key: 'completed', label: 'Completed', value: counts.completed, tone: apptStyles.toneCompleted },
    { key: 'missed', label: 'Missed', value: counts.missed, tone: apptStyles.toneMissed },
  ];

  function renderCell(a: Appointment, col: ColumnKey): React.ReactNode {
    const text = cellText(a, col, profileNames);
    const dash = <span className={apptStyles.muted}>—</span>;
    switch (col) {
      case 'agent': {
        const agent = text === BLANK ? '—' : text;
        const bookedBy = profileNames[a.user_id];
        return (
          <div className={apptStyles.agent}>
            <span className={apptStyles.avatar}>{initials(agent) || '?'}</span>
            <div>
              <div className={apptStyles.agentName}>{agent}</div>
              {bookedBy && !view.visible.includes('bookedBy') && (
                <div className={apptStyles.subtitle}>Booked by {bookedBy}</div>
              )}
            </div>
          </div>
        );
      }
      case 'account': {
        // Without the Client/Campaign columns, the account cell keeps showing them underneath.
        const account = a.account_name || (view.visible.includes('campaign') ? '' : a.project_name);
        return (
          <>
            <div className={apptStyles.account}>{account || dash}</div>
            {!view.visible.includes('client') && a.title && a.title !== account && (
              <div className={apptStyles.subtitle}>{a.title}</div>
            )}
          </>
        );
      }
      case 'booked':
        return (
          <span className={apptStyles.booked} title="When it was booked (the appointment's timezone)">
            {bookedLabel(a)}
          </span>
        );
      case 'appointment': {
        const tzShort = apptTzShort(a);
        return (
          <span className={apptStyles.apptCell} title="When the appointment is (its own timezone)">
            {/* With grouping off or by another column, the date isn't in a group header — show it here. */}
            {view.groupBy[0] !== 'appointment' && view.groupBy[1] !== 'appointment' && a.scheduled_time && (
              <span className={apptStyles.dateLabel}>
                {new Date(a.scheduled_time).toLocaleDateString('en-US', {
                  timeZone: apptTz(a),
                  month: 'short',
                  day: 'numeric',
                })}
                ,{' '}
              </span>
            )}
            <button
              type="button"
              className={apptStyles.timeBtn}
              onClick={(e) => {
                e.stopPropagation();
                setDetail(a);
              }}
            >
              {apptTimeLabel(a)}
            </button>
            {tzShort && !view.visible.includes('timezone') && <span className={apptStyles.tzBadge}>{tzShort}</span>}
          </span>
        );
      }
      case 'timezone':
        return <span className={apptStyles.tzBadge}>{text === BLANK ? '—' : text}</span>;
      case 'status': {
        const st = a.status || 'pending';
        const showLabel =
          a.show_status === 'showed' ? 'Showed' : a.show_status === 'no_show' ? 'No-show' : 'Outcome unknown';
        const showClass =
          a.show_status === 'showed'
            ? apptStyles.outcomeShowed
            : a.show_status === 'no_show'
              ? apptStyles.outcomeNoShow
              : apptStyles.outcomeUnknown;
        return (
          <div className={apptStyles.statusCell}>
            {canSetStatus(a) ? (
              <select
                className={`${apptStyles.pill} ${apptStyles.statusSelect} ${apptStyles[`pill_${outcomeTone(a)}`] || ''}`}
                value={statusChoice(a)}
                title="Change status"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onChange={(e) => handleStatusChange(a, e.target.value)}
              >
                {STATUS_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`${apptStyles.pill} ${apptStyles[`pill_${st}`] || ''}`}>
                <span className={apptStyles.dot} />
                {STATUS_LABEL[st] || st}
              </span>
            )}
            {a.show_status && !canSetStatus(a) && !view.visible.includes('outcome') && (
              <span className={`${apptStyles.outcome} ${showClass}`}>{showLabel}</span>
            )}
          </div>
        );
      }
      case 'outcome': {
        if (!a.show_status) return dash;
        const cls =
          a.show_status === 'showed'
            ? apptStyles.outcomeShowed
            : a.show_status === 'no_show'
              ? apptStyles.outcomeNoShow
              : apptStyles.outcomeUnknown;
        return <span className={`${apptStyles.outcome} ${cls}`}>{text}</span>;
      }
      default:
        return text === BLANK ? dash : text;
    }
  }

  return (
    <div>
      <div className={apptStyles.summary}>
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`${apptStyles.segment} ${s.tone} ${filter === s.key ? apptStyles.segmentActive : ''}`}
            onClick={() => setFilter(filter === s.key && s.key !== 'all' ? 'all' : s.key)}
          >
            <span className={apptStyles.segmentValue}>{s.value}</span>
            <span className={apptStyles.segmentLabel}>{s.label}</span>
          </button>
        ))}
        <div className={apptStyles.showRate}>
          <span className={apptStyles.segmentValue}>{showRate === null ? '—' : `${showRate}%`}</span>
          <span className={apptStyles.segmentLabel}>Show rate</span>
          <span className={apptStyles.showRateSub}>
            {decided
              ? `${showed} showed · ${noShow} no-show`
              : 'No outcomes set yet'}
            {unknown > 0 && ` · ${unknown} unknown`}
          </span>
        </div>
      </div>

      <div className={toolbarStyles.toolbar}>
        <div className={toolbarStyles.searchField}>
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search every column…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filterCount > 0 && (
          <button
            type="button"
            className={apptStyles.toolBtn}
            onClick={() => setView((v) => ({ ...v, filters: {} }))}
          >
            Clear {filterCount} filter{filterCount === 1 ? '' : 's'}
          </button>
        )}
        <div className={apptStyles.settingsWrap}>
          <button
            type="button"
            className={`${apptStyles.toolBtn} ${settingsOpen ? apptStyles.toolBtnActive : ''}`}
            onClick={() => setSettingsOpen((o) => !o)}
            aria-expanded={settingsOpen}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            View settings
          </button>
          {settingsOpen && <SheetViewSettings view={view} onChange={setView} onClose={() => setSettingsOpen(false)} />}
        </div>
      </div>

      {editError && <div className={apptStyles.editError}>{editError}</div>}

      <div className={`${styles.tableWrap} ${apptStyles.wrap}`}>
        <table className={`${styles.table} ${apptStyles.table}`}>
          <thead>
            <tr>
              {visibleCols.map((c) => {
                const active = view.sort.col === c.key;
                return (
                  <th key={c.key} aria-sort={active ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={apptStyles.sortBtn} onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span className={`${apptStyles.sortIcon} ${active ? apptStyles.sortIconActive : ''}`}>
                        {active ? (view.sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
            <tr className={apptStyles.filterRow}>
              {visibleCols.map((c) => {
                const value = view.filters[c.key] || '';
                return (
                  <th key={c.key}>
                    {c.filter === 'text' ? (
                      <input
                        type="text"
                        className={`${apptStyles.filterInput} ${value ? apptStyles.filterOn : ''}`}
                        placeholder="Filter…"
                        value={value}
                        onChange={(e) => setColumnFilter(c.key, e.target.value)}
                      />
                    ) : (
                      <select
                        className={`${apptStyles.filterInput} ${value ? apptStyles.filterOn : ''}`}
                        value={value}
                        onChange={(e) => setColumnFilter(c.key, e.target.value)}
                      >
                        {c.filter === 'date'
                          ? DATE_RANGES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))
                          : [
                              <option key="" value="">
                                All
                              </option>,
                              ...distinctValues(appointments, c.key, profileNames).map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              )),
                            ]}
                      </select>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={visibleCols.length} className={styles.tableEmpty}>
                  {appointments.length ? 'No appointments match these filters.' : 'No appointments booked yet.'}
                </td>
              </tr>
            )}
            {(groups || [{ key: 'all', labels: [], day: null, items: filtered }]).map((g) => {
              const rel = g.day ? relativeDay(g.day) : '';
              return (
                <React.Fragment key={g.key}>
                  {groups && (
                    <tr className={apptStyles.groupRow}>
                      <td colSpan={visibleCols.length}>
                        <div className={apptStyles.groupInner}>
                          <span className={apptStyles.groupDate}>{g.labels.join(' · ')}</span>
                          {rel && (
                            <span className={`${apptStyles.groupRel} ${rel === 'Today' ? apptStyles.groupToday : ''}`}>
                              {rel}
                            </span>
                          )}
                          <span className={apptStyles.groupCount}>{groupSummary(g.items)}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {g.items.map((a) => (
                    <tr
                      key={a.id}
                      className={apptStyles.row}
                      title={canEdit(a) ? 'Double-click to edit' : undefined}
                      onClick={() => handleRowClick(a)}
                      onDoubleClick={() => handleRowDoubleClick(a)}
                    >
                      {visibleCols.map((c) => (
                        <td key={c.key}>{renderCell(a, c.key)}</td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && user && (
        <AppointmentModal
          appointment={editing}
          currentUserId={user.id}
          currentUserName={user.name || ''}
          onSave={handleEditSave}
          onClose={() => setEditing(null)}
        />
      )}

      {detail && (
        <AppointmentDetailCard
          appointment={detail}
          agentName={detail.agent_name || undefined}
          tz={apptTz(detail)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
