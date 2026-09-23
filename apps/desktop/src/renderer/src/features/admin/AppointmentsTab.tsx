import React, { useMemo, useState } from 'react';
import type { AdminData } from './useAdminData';
import AdminToolbar from './AdminToolbar';
import styles from './AdminShared.module.css';

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

// Ports admin.js's renderAppts(): appointments grouped by date (desc),
// with a search + sort + status-filter toolbar above it.
export default function AppointmentsTab({ data }: Props) {
  const [filter, setFilter] = useState<ApptFilter>('all');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [search, setSearch] = useState('');
  const { appointments, profileMap } = data;

  const withOutcome = appointments.filter((a) => a.show_status);
  const showed = withOutcome.filter((a) => a.show_status === 'showed').length;
  const showRate = withOutcome.length ? Math.round((showed / withOutcome.length) * 100) : null;

  const filtered = useMemo(() => {
    let list = filter === 'all' ? appointments : appointments.filter((a) => a.status === filter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const agent = (profileMap[a.user_id]?.name || '').toLowerCase();
        return (
          (a.title || '').toLowerCase().includes(q) ||
          (a.project_name || '').toLowerCase().includes(q) ||
          agent.includes(q)
        );
      });
    }

    list = [...list].sort((a, b) => {
      if (sort === 'agent') {
        const na = profileMap[a.user_id]?.name || '';
        const nb = profileMap[b.user_id]?.name || '';
        return na.localeCompare(nb);
      }
      const da = a.scheduled_time || '';
      const db = b.scheduled_time || '';
      return sort === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

    return list;
  }, [appointments, filter, sort, search, profileMap]);

  const byDate: Record<string, typeof appointments> = {};
  filtered.forEach((a) => {
    const d = a.scheduled_time ? a.scheduled_time.slice(0, 10) : 'Unknown';
    (byDate[d] = byDate[d] || []).push(a);
  });
  const dateKeys =
    sort === 'agent' ? Object.keys(byDate) : Object.keys(byDate).sort((a, b) => (sort === 'date-asc' ? a.localeCompare(b) : b.localeCompare(a)));

  return (
    <div>
      {showRate !== null && (
        <div className={styles.showRateBanner}>
          <span className={styles.showRateVal}>{showRate}%</span> show rate
          <span className={styles.showRateSub}>
            ({showed} showed / {withOutcome.length - showed} no-show, out of {withOutcome.length} completed with an outcome)
          </span>
        </div>
      )}
      <AdminToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search appointments, project, or agent..."
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={(v) => setSort(v as SortKey)}
        filterOptions={FILTERS}
        filterValue={filter}
        onFilterChange={(v) => setFilter(v as ApptFilter)}
      />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Project</th>
              <th>Title</th>
              <th>Scheduled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>
                  No appointments found.
                </td>
              </tr>
            )}
            {dateKeys.map((d) => {
              const label =
                d === 'Unknown'
                  ? 'Unknown date'
                  : new Date(`${d}T12:00:00`).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
              return (
                <React.Fragment key={d}>
                  <tr className={styles.dateGroupRow}>
                    <td colSpan={5}>{label}</td>
                  </tr>
                  {byDate[d].map((a) => {
                    const agent = profileMap[a.user_id]?.name || 'Unknown';
                    const time = a.scheduled_time
                      ? new Date(a.scheduled_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : '—';
                    const st = a.status || 'pending';
                    return (
                      <tr key={a.id}>
                        <td>
                          <strong>{agent}</strong>
                        </td>
                        <td>{a.project_name || ''}</td>
                        <td>{a.title || ''}</td>
                        <td>{time}</td>
                        <td>
                          <span className={styles.statusBadge}>{st}</span>
                          {a.show_status && (
                            <span className={`${styles.showBadge} ${a.show_status === 'showed' ? styles.showed : styles.noShow}`}>
                              {a.show_status === 'showed' ? 'Showed' : 'No-show'}
                            </span>
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
    </div>
  );
}
