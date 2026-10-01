import React, { useMemo, useState } from 'react';
import type { Appointment, ShowStatus } from '@amber-flow/shared';
import styles from './AppointmentList.module.css';
import shared from '../admin/AdminShared.module.css';
import appt from '../admin/AppointmentsTab.module.css';
import AppointmentModal from './AppointmentModal';
import AppointmentDetailCard from './AppointmentDetailCard';
import Dropdown from '../../components/Dropdown';
import type { NewAppointmentInput } from './useAppointments';
import { bookedLabel, apptTimeLabel, apptTz, apptTzShort, dayHeading, groupByDay, initials, relativeDay } from './apptFormat';

interface AppointmentListProps {
  appointments: Appointment[];
  agentName?: string; // signed-in user's name — only used to label the New Appointment form
  currentUserId: string;
  // Whether the signed-in user may change this row (Done/Miss/Edit/Delete).
  // Defaults to "yes" — Reports passes own-row-or-admin.
  canModify?: (a: Appointment) => boolean;
  onCreate: (input: NewAppointmentInput) => Promise<void> | void;
  onUpdate: (id: string, input: NewAppointmentInput) => Promise<void> | void;
  onComplete: (id: string, showStatus?: ShowStatus) => void;
  onMiss: (id: string) => void;
  onDelete: (id: string) => void;
}

type ApptFilter = 'all' | 'pending' | 'completed' | 'missed';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  missed: 'Missed',
};

// Appointments on My Reports — everyone's, attributed by agent_name (the
// admin-managed Agent list name chosen on the appointment, never a login or
// display name) — in the same format as Admin → Appointments (summary strip,
// date-grouped table in each appointment's own timezone, status pills), with
// an Agent filter and Done / Miss / Edit / Delete on rows the signed-in user
// may change.
export default function AppointmentList({
  appointments,
  agentName,
  currentUserId,
  onCreate,
  onUpdate,
  onComplete,
  onMiss,
  onDelete,
  canModify = () => true,
}: AppointmentListProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [filter, setFilter] = useState<ApptFilter>('all');
  const [agentFilter, setAgentFilter] = useState('');

  const agentNames = useMemo(
    () =>
      Array.from(new Set(appointments.map((a) => a.agent_name?.trim()).filter((n): n is string => !!n))).sort((x, y) =>
        x.localeCompare(y)
      ),
    [appointments]
  );
  // Everything below (counts, show rate, list) reflects the chosen agent.
  const scoped = useMemo(
    () => (agentFilter ? appointments.filter((a) => (a.agent_name || '').trim() === agentFilter) : appointments),
    [appointments, agentFilter]
  );

  const counts = useMemo(() => {
    const c = { all: scoped.length, pending: 0, completed: 0, missed: 0 };
    scoped.forEach((a) => {
      const st = (a.status || 'pending') as 'pending' | 'completed' | 'missed';
      if (st in c) c[st] += 1;
    });
    return c;
  }, [scoped]);

  const showed = scoped.filter((a) => a.show_status === 'showed').length;
  const noShow = scoped.filter((a) => a.show_status === 'no_show').length;
  const unknown = scoped.filter((a) => a.show_status === 'uncertain').length;
  const decided = showed + noShow;
  const showRate = decided ? Math.round((showed / decided) * 100) : null;

  const groups = useMemo(() => {
    const list = (filter === 'all' ? scoped : scoped.filter((a) => (a.status || 'pending') === filter))
      .slice()
      .sort((a, b) => (b.scheduled_time || '').localeCompare(a.scheduled_time || ''));
    return groupByDay(list);
  }, [scoped, filter]);

  const segments: { key: ApptFilter; label: string; value: number; tone: string }[] = [
    { key: 'all', label: 'Total', value: counts.all, tone: appt.toneAll },
    { key: 'pending', label: 'Pending', value: counts.pending, tone: appt.tonePending },
    { key: 'completed', label: 'Completed', value: counts.completed, tone: appt.toneCompleted },
    { key: 'missed', label: 'Missed', value: counts.missed, tone: appt.toneMissed },
  ];

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setModalOpen(true);
  }

  async function handleSave(input: NewAppointmentInput) {
    if (editing) {
      await onUpdate(editing.id, input);
    } else {
      await onCreate(input);
    }
  }

  return (
    <section className={styles.apptSection}>
      <div className={styles.apptHeader}>
        <h2 className={styles.sectionTitle}>
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Appointments
        </h2>
        <button type="button" className={styles.primaryBtn} onClick={openCreate}>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Appointment
        </button>
      </div>

      {agentNames.length > 0 && (
        <div className={styles.agentFilter}>
          <span>Agent</span>
          <Dropdown
            value={agentFilter}
            onChange={setAgentFilter}
            options={[{ value: '', label: 'All agents' }, ...agentNames.map((n) => ({ value: n, label: n }))]}
          />
        </div>
      )}

      <div className={appt.summary}>
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`${appt.segment} ${s.tone} ${filter === s.key ? appt.segmentActive : ''}`}
            onClick={() => setFilter(filter === s.key && s.key !== 'all' ? 'all' : s.key)}
          >
            <span className={appt.segmentValue}>{s.value}</span>
            <span className={appt.segmentLabel}>{s.label}</span>
          </button>
        ))}
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{showRate === null ? '—' : `${showRate}%`}</span>
          <span className={appt.segmentLabel}>Show rate</span>
          <span className={appt.showRateSub}>
            {decided ? `${showed} showed · ${noShow} no-show` : 'No outcomes set yet'}
            {unknown > 0 && ` · ${unknown} unknown`}
          </span>
        </div>
      </div>

      <div className={`${shared.tableWrap} ${appt.wrap}`}>
        <table className={`${shared.table} ${appt.table}`}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Account</th>
              <th>Booked</th>
              <th>Appointment</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!groups.length && (
              <tr>
                <td colSpan={6} className={shared.tableEmpty}>
                  {filter !== 'all'
                    ? 'No appointments with this status.'
                    : 'No appointments yet. Click "New Appointment" to schedule a follow-up.'}
                </td>
              </tr>
            )}
            {groups.map(({ key, items }) => {
              const rel = relativeDay(key);
              return (
                <React.Fragment key={key}>
                  <tr className={appt.groupRow}>
                    <td colSpan={6}>
                      <div className={appt.groupInner}>
                        <span className={appt.groupDate}>{dayHeading(key)}</span>
                        {rel && (
                          <span className={`${appt.groupRel} ${rel === 'Today' ? appt.groupToday : ''}`}>{rel}</span>
                        )}
                        <span className={appt.groupCount}>
                          {items.length} {items.length === 1 ? 'appointment' : 'appointments'}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {items.map((a) => {
                    const st = a.status || 'pending';
                    const account = a.account_name || a.project_name;
                    const tzShort = apptTzShort(a);
                    const showLabel =
                      a.show_status === 'showed' ? 'Showed' : a.show_status === 'no_show' ? 'No-show' : 'Outcome unknown';
                    const showClass =
                      a.show_status === 'showed'
                        ? appt.outcomeShowed
                        : a.show_status === 'no_show'
                          ? appt.outcomeNoShow
                          : appt.outcomeUnknown;
                    const resolvable = a.show_status === 'uncertain';
                    const rowAgent = a.agent_name || '—';
                    const mayChange = canModify(a);
                    return (
                      <tr key={a.id} className={appt.row} onClick={() => setDetail(a)}>
                        <td>
                          <div className={appt.agent}>
                            <span className={appt.avatar}>{initials(rowAgent) || '?'}</span>
                            <span className={appt.agentName}>{rowAgent}</span>
                          </div>
                        </td>
                        <td>
                          <div className={appt.account}>{account || <span className={appt.muted}>—</span>}</div>
                          {a.title && a.title !== account && <div className={appt.subtitle}>{a.title}</div>}
                        </td>
                        <td className={appt.booked} title="When it was booked (your computer's time)">
                          {bookedLabel(a)}
                        </td>
                        <td title="When the appointment is (its own timezone)">
                          <button
                            type="button"
                            className={appt.timeBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail(a);
                            }}
                          >
                            {apptTimeLabel(a)}
                          </button>
                          {tzShort && <span className={appt.tzBadge}>{tzShort}</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className={appt.statusCell}>
                            <span className={`${appt.pill} ${appt[`pill_${st}`] || ''}`}>
                              <span className={appt.dot} />
                              {STATUS_LABEL[st] || st}
                            </span>
                            {a.show_status && resolvingId !== a.id && (
                              <button
                                type="button"
                                className={`${appt.outcome} ${showClass} ${resolvable ? styles.resolvableOutcome : ''}`}
                                disabled={!resolvable || !mayChange}
                                title={resolvable && mayChange ? 'Set Showed or No-show' : undefined}
                                onClick={() => resolvable && mayChange && setResolvingId(a.id)}
                              >
                                {showLabel}
                              </button>
                            )}
                            {resolvingId === a.id && (
                              <div className={styles.showPrompt}>
                                <button
                                  type="button"
                                  className={styles.showBtn}
                                  onClick={() => {
                                    onComplete(a.id, 'showed');
                                    setResolvingId(null);
                                  }}
                                >
                                  Showed
                                </button>
                                <button
                                  type="button"
                                  className={styles.noShowBtn}
                                  onClick={() => {
                                    onComplete(a.id, 'no_show');
                                    setResolvingId(null);
                                  }}
                                >
                                  No-show
                                </button>
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  onClick={() => setResolvingId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {mayChange && (
                          <div className={styles.apptActions}>
                            {st === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  className={styles.apptDoneBtn}
                                  onClick={() => onComplete(a.id, 'uncertain')}
                                >
                                  Done
                                </button>
                                <button type="button" className={styles.apptMissBtn} onClick={() => onMiss(a.id)}>
                                  Miss
                                </button>
                              </>
                            )}
                            <button type="button" className={styles.iconBtn} title="Edit" onClick={() => openEdit(a)}>
                              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.danger}`}
                              title="Delete"
                              onClick={() => onDelete(a.id)}
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                          )}
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

      {modalOpen && (
        <AppointmentModal
          appointment={editing}
          currentUserId={currentUserId}
          currentUserName={agentName || ''}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
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
    </section>
  );
}
