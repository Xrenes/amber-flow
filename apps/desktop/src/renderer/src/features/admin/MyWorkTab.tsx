import React from 'react';
import type { AdminData } from './useAdminData';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
  userId: string;
}

// Ports admin.js's renderMyWork(): the logged-in admin/manager's own personal
// activity for the selected date range — KPIs + recent appointments/tasks/
// time sessions, all filtered client-side to user_id === userId.
export default function MyWorkTab({ data, userId }: Props) {
  const { appointments, tasks, sessions } = data;

  const myAppts = appointments.filter((a) => a.user_id === userId);
  const myTasks = tasks.filter((t) => t.user_id === userId);
  const mySessions = sessions.filter((s) => s.user_id === userId);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySec = mySessions
    .filter((s) => s.start_time?.slice(0, 10) === todayStr)
    .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const totalSec = mySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const totalH = Math.floor(totalSec / 3600);
  const totalM = Math.floor((totalSec % 3600) / 60);
  const todayH = (todaySec / 3600).toFixed(1);
  const doneAppts = myAppts.filter((a) => a.status === 'completed').length;
  const doneTasks = myTasks.filter((t) => t.completed).length;

  const now = new Date();

  return (
    <div>
      <div className={styles.mwNote}>Showing your personal activity for the selected date range.</div>

      <div className={styles.mwKpiRow}>
        <div className={styles.kpiCardLocal}>
          <div className={`${styles.mwKpiVal} ${styles.accent}`}>{todayH}h</div>
          <div className={styles.mwKpiLabel}>Today</div>
        </div>
        <div className={styles.kpiCardLocal}>
          <div className={`${styles.mwKpiVal} ${styles.accent}`}>
            {totalH}h {totalM}m
          </div>
          <div className={styles.mwKpiLabel}>Total Time</div>
        </div>
        <div className={styles.kpiCardLocal}>
          <div className={`${styles.mwKpiVal} ${styles.success}`}>
            {doneAppts} / {myAppts.length}
          </div>
          <div className={styles.mwKpiLabel}>Appts Done</div>
        </div>
        <div className={styles.kpiCardLocal}>
          <div className={`${styles.mwKpiVal} ${styles.success}`}>
            {doneTasks} / {myTasks.length}
          </div>
          <div className={styles.mwKpiLabel}>Tasks Done</div>
        </div>
      </div>

      <div className={styles.mwGrid}>
        <div className={styles.mwSection}>
          <div className={styles.mwSectionTitle}>Appointments</div>
          {myAppts.length ? (
            myAppts.slice(0, 20).map((a) => {
              const time = a.scheduled_time
                ? new Date(a.scheduled_time).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })
                : '—';
              const st = a.status || 'pending';
              const stClass = st === 'completed' ? 'success' : st === 'missed' ? 'danger' : 'accent';
              return (
                <div key={a.id} className={styles.mwItem}>
                  <div className={styles.mwItemMain}>
                    <div className={styles.mwItemTitle}>{a.title || 'Untitled'}</div>
                    <div className={styles.mwItemSub}>
                      {a.project_name ? `${a.project_name} · ` : ''}
                      {time}
                    </div>
                  </div>
                  <div className={`${styles.mwItemMeta} ${styles[stClass]}`}>{st}</div>
                </div>
              );
            })
          ) : (
            <p className={styles.mwEmpty}>No appointments in this date range.</p>
          )}
        </div>

        <div className={styles.mwSection}>
          <div className={styles.mwSectionTitle}>Tasks</div>
          {myTasks.length ? (
            myTasks.slice(0, 20).map((t) => {
              const dt = new Date(`${t.date}T${t.time}`);
              const dtStr = dt.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
              const done = t.completed;
              const overdue = !done && dt < now;
              const stLabel = done ? 'Done' : overdue ? 'Overdue' : 'Pending';
              const stClass = done ? 'success' : overdue ? 'danger' : 'accent';
              return (
                <div key={t.id} className={styles.mwItem}>
                  <div className={styles.mwItemMain}>
                    <div className={styles.mwItemTitle}>{t.title || 'Untitled'}</div>
                    <div className={styles.mwItemSub}>{dtStr}</div>
                  </div>
                  <div className={`${styles.mwItemMeta} ${styles[stClass]}`}>{stLabel}</div>
                </div>
              );
            })
          ) : (
            <p className={styles.mwEmpty}>No tasks in this date range.</p>
          )}
        </div>
      </div>

      <div className={styles.mwSection}>
        <div className={styles.mwSectionTitle}>Time Sessions</div>
        {mySessions.length ? (
          mySessions.slice(0, 10).map((s) => {
            const date = s.start_time ? s.start_time.slice(0, 10) : '—';
            const start = s.start_time
              ? new Date(s.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              : '—';
            const end = s.end_time
              ? new Date(s.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              : 'ongoing';
            const h = Math.floor((s.duration_seconds || 0) / 3600);
            const m = Math.floor(((s.duration_seconds || 0) % 3600) / 60);
            const dur = s.duration_seconds ? `${h}h ${m}m` : '—';
            return (
              <div key={s.id} className={styles.mwItem}>
                <div className={styles.mwItemMain}>
                  <div className={styles.mwItemTitle}>{s.project_name || 'No project'}</div>
                  <div className={styles.mwItemSub}>
                    {date} &nbsp;·&nbsp; {start} – {end}
                  </div>
                </div>
                <div className={`${styles.mwItemMeta} ${styles.accent}`}>{dur}</div>
              </div>
            );
          })
        ) : (
          <p className={styles.mwEmpty}>No time sessions in this date range.</p>
        )}
      </div>
    </div>
  );
}
