import React, { useMemo } from 'react';
import type { AdminData } from './useAdminData';
import sharedStyles from './AdminShared.module.css';
import styles from './ProductivityReportsTab.module.css';

interface Props {
  data: AdminData;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  totalSeconds: number;
  tasksAssigned: number;
  tasksCompleted: number;
  apptsTotal: number;
  apptsCompleted: number;
  apptsMissed: number;
}

function fmtHours(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function toCsv(rows: AgentRow[]): string {
  const header = [
    'Agent',
    'Role',
    'Hours Tracked',
    'Tasks Assigned',
    'Tasks Completed',
    'Task Completion %',
    'Appointments Total',
    'Appointments Completed',
    'Appointments Missed',
    'Appointment Completion %',
  ];
  const lines = rows.map((r) => {
    const taskPct = r.tasksAssigned ? Math.round((r.tasksCompleted / r.tasksAssigned) * 100) : 0;
    const apptPct = r.apptsTotal ? Math.round((r.apptsCompleted / r.apptsTotal) * 100) : 0;
    return [
      r.name,
      r.role,
      fmtHours(r.totalSeconds),
      r.tasksAssigned,
      r.tasksCompleted,
      `${taskPct}%`,
      r.apptsTotal,
      r.apptsCompleted,
      r.apptsMissed,
      `${apptPct}%`,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

// Productivity Reports plugin: per-agent rollup over the Admin Panel's
// current date range (shared header date filter), built from data
// useAdminData already fetches — no separate query needed.
export default function ProductivityReportsTab({ data }: Props) {
  const { profiles, tasks, appointments, sessions } = data;

  const rows = useMemo<AgentRow[]>(() => {
    return profiles.map((p) => {
      const mySessions = sessions.filter((s) => s.user_id === p.id);
      const myTasks = tasks.filter((t) => t.user_id === p.id);
      const myAppts = appointments.filter((a) => a.user_id === p.id);
      return {
        id: p.id,
        name: p.name || 'Unknown',
        role: p.role || 'agent',
        totalSeconds: mySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0),
        tasksAssigned: myTasks.length,
        tasksCompleted: myTasks.filter((t) => t.completed).length,
        apptsTotal: myAppts.length,
        apptsCompleted: myAppts.filter((a) => a.status === 'completed').length,
        apptsMissed: myAppts.filter((a) => a.status === 'missed').length,
      };
    });
  }, [profiles, tasks, appointments, sessions]);

  function handleExport() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amber-flow-productivity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!profiles.length) {
    return <p className={sharedStyles.feedPlaceholder}>No agents found yet.</p>;
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <p className={styles.hint}>Based on the date range selected above.</p>
        <button type="button" className={styles.exportBtn} onClick={handleExport}>
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className={sharedStyles.tableWrap}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Hours</th>
              <th>Tasks</th>
              <th>Task %</th>
              <th>Appointments</th>
              <th>Appt %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const taskPct = r.tasksAssigned ? Math.round((r.tasksCompleted / r.tasksAssigned) * 100) : null;
              const apptPct = r.apptsTotal ? Math.round((r.apptsCompleted / r.apptsTotal) * 100) : null;
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{fmtHours(r.totalSeconds)}</td>
                  <td>
                    {r.tasksCompleted} / {r.tasksAssigned}
                  </td>
                  <td>{taskPct === null ? '—' : `${taskPct}%`}</td>
                  <td>
                    {r.apptsCompleted} / {r.apptsTotal}
                    {r.apptsMissed > 0 && <span className={styles.missedNote}> ({r.apptsMissed} missed)</span>}
                  </td>
                  <td>{apptPct === null ? '—' : `${apptPct}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
