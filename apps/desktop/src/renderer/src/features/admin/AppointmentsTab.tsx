import React, { useMemo, useState } from 'react';
import type { Appointment } from '@amber-flow/shared';
import type { AdminData } from './useAdminData';
import AdminToolbar from './AdminToolbar';
import AppointmentDetailCard from '../appointments/AppointmentDetailCard';
import {
  bookedLabel,
  apptTimeLabel,
  apptTz,
  apptTzShort,
  dayHeading,
  groupByDay,
  initials,
  relativeDay,
} from '../appointments/apptFormat';
import styles from './AdminShared.module.css';
import apptStyles from './AppointmentsTab.module.css';

interface Props {
  data: AdminData;
}

type ApptFilter = 'all' | 'pending' | 'completed' | 'missed';
type SortKey = 'date-desc' | 'date-asc' | 'agent';

const FILTERS: { key: ApptFilter; label: string }[] = [
  { key: 'all', label: 'All statuses' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Missed' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date-desc', label: 'Newest first' },
  { key: 'date-asc', label: 'Oldest first' },
  { key: 'agent', label: 'Agent name' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  missed: 'Missed',
};

// Ports admin.js's renderAppts(): appointments grouped by their scheduled
// date (in the appointment's own timezone, so the date is the one the agent
// booked for, not this computer's local date), with a summary strip (click
// a segment to filter) and a search + sort + status-filter toolbar above it.
export default function AppointmentsTab({ data }: Props) {
  const [filter, setFilter] = useState<ApptFilter>('all');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Appointment | null>(null);
  const { appointments, profileMap } = data;

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

  const filtered = useMemo(() => {
    let list = filter === 'all' ? appointments : appointments.filter((a) => (a.status || 'pending') === filter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const agent = (a.agent_name || '').toLowerCase();
        return (
          (a.title || '').toLowerCase().includes(q) ||
          (a.project_name || '').toLowerCase().includes(q) ||
          (a.account_name || '').toLowerCase().includes(q) ||
          agent.includes(q)
        );
      });
    }

    list = [...list].sort((a, b) => {
      if (sort === 'agent') {
        const na = a.agent_name || '';
        const nb = b.agent_name || '';
        return na.localeCompare(nb);
      }
      const da = a.scheduled_time || '';
      const db = b.scheduled_time || '';
      return sort === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

    return list;
  }, [appointments, filter, sort, search, profileMap]);

  const groups = groupByDay(filtered);

  const segments: { key: ApptFilter; label: string; value: number; tone: string }[] = [
    { key: 'all', label: 'Total', value: counts.all, tone: apptStyles.toneAll },
    { key: 'pending', label: 'Pending', value: counts.pending, tone: apptStyles.tonePending },
    { key: 'completed', label: 'Completed', value: counts.completed, tone: apptStyles.toneCompleted },
    { key: 'missed', label: 'Missed', value: counts.missed, tone: apptStyles.toneMissed },
  ];

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

      <AdminToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search appointments, account, project, or agent..."
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={(v) => setSort(v as SortKey)}
        filterOptions={FILTERS}
        filterValue={filter}
        onFilterChange={(v) => setFilter(v as ApptFilter)}
      />

      <div className={`${styles.tableWrap} ${apptStyles.wrap}`}>
        <table className={`${styles.table} ${apptStyles.table}`}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Account</th>
              <th>Booked</th>
              <th>Appointment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>
                  {search || filter !== 'all' ? 'No appointments match these filters.' : 'No appointments booked yet.'}
                </td>
              </tr>
            )}
            {groups.map(({ key: d, items }) => {
              const label = dayHeading(d);
              const rel = relativeDay(d);
              const isToday = rel === 'Today';
              return (
                <React.Fragment key={d}>
                  <tr className={apptStyles.groupRow}>
                    <td colSpan={5}>
                      <div className={apptStyles.groupInner}>
                        <span className={apptStyles.groupDate}>{label}</span>
                        {rel && (
                          <span className={`${apptStyles.groupRel} ${isToday ? apptStyles.groupToday : ''}`}>{rel}</span>
                        )}
                        <span className={apptStyles.groupCount}>
                          {items.length} {items.length === 1 ? 'appointment' : 'appointments'}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {items.map((a) => {
                    // Agent = the admin-managed Agent list name on the appointment,
                    // never a login/display name; "Booked by" shows who saved it.
                    const agent = a.agent_name || '—';
                    const bookedBy = profileMap[a.user_id]?.name || null;
                    const time = apptTimeLabel(a);
                    const tzShort = apptTzShort(a);
                    const st = a.status || 'pending';
                    const showLabel =
                      a.show_status === 'showed' ? 'Showed' : a.show_status === 'no_show' ? 'No-show' : 'Outcome unknown';
                    const showClass =
                      a.show_status === 'showed'
                        ? apptStyles.outcomeShowed
                        : a.show_status === 'no_show'
                          ? apptStyles.outcomeNoShow
                          : apptStyles.outcomeUnknown;
                    const account = a.account_name || a.project_name;
                    return (
                      <tr key={a.id} className={apptStyles.row} onClick={() => setDetail(a)}>
                        <td>
                          <div className={apptStyles.agent}>
                            <span className={apptStyles.avatar}>{initials(agent) || '?'}</span>
                            <div>
                              <div className={apptStyles.agentName}>{agent}</div>
                              {bookedBy && <div className={apptStyles.subtitle}>Booked by {bookedBy}</div>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={apptStyles.account}>{account || <span className={apptStyles.muted}>—</span>}</div>
                          {a.title && a.title !== account && <div className={apptStyles.subtitle}>{a.title}</div>}
                        </td>
                        <td className={apptStyles.booked} title="When it was booked (your computer's time)">
                          {bookedLabel(a)}
                        </td>
                        <td title="When the appointment is (its own timezone)">
                          <button
                            type="button"
                            className={apptStyles.timeBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail(a);
                            }}
                          >
                            {time}
                          </button>
                          {tzShort && <span className={apptStyles.tzBadge}>{tzShort}</span>}
                        </td>
                        <td>
                          <div className={apptStyles.statusCell}>
                            <span className={`${apptStyles.pill} ${apptStyles[`pill_${st}`] || ''}`}>
                              <span className={apptStyles.dot} />
                              {STATUS_LABEL[st] || st}
                            </span>
                            {a.show_status && (
                              <span className={`${apptStyles.outcome} ${showClass}`}>{showLabel}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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
