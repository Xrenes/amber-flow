import React, { useMemo, useState } from 'react';
import { groupWorkedTimeByDay, colorForAccount, fmtHM, localDayKey, type WorkedSession } from './workedTime';
import appt from '../features/admin/AppointmentsTab.module.css';
import shared from '../features/admin/AdminShared.module.css';
import styles from './WorkedTimeReport.module.css';

interface WorkedTimeReportProps {
  sessions: WorkedSession[];
}

type Period = '7' | '30' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

const TARGET_SECONDS = 8 * 3600;

function fmtHours(sec: number): string {
  return `${(sec / 3600).toFixed(1)}h`;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function relLabel(date: string): string {
  const today = localDayKey(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (date === today) return 'Today';
  if (date === localDayKey(y)) return 'Yesterday';
  return '';
}

// Worked-time report from Time Tracker sessions: period summary, a daily
// stacked chart by account against an 8h target, hours per account, and a
// daily log (click a day for its per-account split). Every account keeps
// one color everywhere. Used by the agent's My Reports page.
export default function WorkedTimeReport({ sessions }: WorkedTimeReportProps) {
  const [period, setPeriod] = useState<Period>('7');
  const [openDate, setOpenDate] = useState<string | null>(null);

  const allDays = useMemo(() => groupWorkedTimeByDay(sessions), [sessions]);

  // Stable color per account, ranked by all-time hours.
  const colorOf = useMemo(() => {
    const totals: Record<string, number> = {};
    allDays.forEach((d) => d.slices.forEach((s) => (totals[s.account] = (totals[s.account] || 0) + s.seconds)));
    const order = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([a]) => a);
    const map: Record<string, string> = {};
    order.forEach((a, i) => (map[a] = colorForAccount(i)));
    return (account: string) => map[account] || colorForAccount(0);
  }, [allDays]);

  // Continuous run of dates for the chart (days with no work show as gaps).
  const range = useMemo(() => {
    const n = period === 'all' ? 30 : Number(period);
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(localDayKey(d));
    }
    return out;
  }, [period]);

  const days = useMemo(
    () => (period === 'all' ? allDays : allDays.filter((d) => d.date >= range[0])),
    [allDays, period, range]
  );

  const summary = useMemo(() => {
    const total = days.reduce((s, d) => s + d.totalSeconds, 0);
    const best = days.reduce<(typeof days)[number] | null>((b, d) => (!b || d.totalSeconds > b.totalSeconds ? d : b), null);
    const byAccount: Record<string, number> = {};
    days.forEach((d) => d.slices.forEach((s) => (byAccount[s.account] = (byAccount[s.account] || 0) + s.seconds)));
    const accounts = Object.entries(byAccount)
      .map(([account, seconds]) => ({ account, seconds, pct: total ? (seconds / total) * 100 : 0 }))
      .sort((a, b) => b.seconds - a.seconds);
    return {
      total,
      daysWorked: days.length,
      avg: days.length ? total / days.length : 0,
      best,
      accounts,
    };
  }, [days]);

  const dayMap = useMemo(() => {
    const m: Record<string, (typeof allDays)[number]> = {};
    allDays.forEach((d) => (m[d.date] = d));
    return m;
  }, [allDays]);

  // Chart scale: at least the 8h target, so a short day doesn't fill the chart.
  const chartMax = Math.max(TARGET_SECONDS, ...range.map((d) => dayMap[d]?.totalSeconds || 0));
  const targetPct = (TARGET_SECONDS / chartMax) * 100;

  if (!allDays.length) {
    return (
      <div className={styles.emptyState}>
        <h3>No worked time yet</h3>
        <p>Start the Time Tracker on Home, and your hours will show up here by day and account.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.periods}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`${styles.chip} ${period === p.key ? styles.chipActive : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className={styles.note}>Finished Time Tracker sessions</span>
      </div>

      {/* ── Summary ── */}
      <div className={`${appt.summary} ${styles.summary}`}>
        <div className={appt.showRate}>
          <span className={`${appt.segmentValue} ${styles.accentVal}`}>{fmtHours(summary.total)}</span>
          <span className={appt.segmentLabel}>Total worked</span>
        </div>
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{summary.daysWorked}</span>
          <span className={appt.segmentLabel}>Days worked</span>
        </div>
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{fmtHours(summary.avg)}</span>
          <span className={appt.segmentLabel}>Average per day</span>
        </div>
        <div className={appt.showRate}>
          <span className={appt.segmentValue}>{summary.best ? fmtHours(summary.best.totalSeconds) : '—'}</span>
          <span className={appt.segmentLabel}>Best day</span>
          {summary.best && (
            <span className={appt.showRateSub}>
              {new Date(`${summary.best.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        <div className={appt.showRate}>
          <span className={`${appt.segmentValue} ${styles.accountVal}`}>
            {summary.accounts[0] && <span className={styles.dot} style={{ background: colorOf(summary.accounts[0].account) }} />}
            {summary.accounts[0]?.account || '—'}
          </span>
          <span className={appt.segmentLabel}>Top account</span>
          {summary.accounts[0] && <span className={appt.showRateSub}>{fmtHM(summary.accounts[0].seconds)}</span>}
        </div>
      </div>

      <div className={styles.twoCol}>
        {/* ── Daily chart ── */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Daily hours</h3>
            <span className={styles.targetKey}>
              <span className={styles.targetSwatch} /> 8h target
            </span>
          </div>
          <div className={styles.chart}>
            <div className={styles.target} style={{ bottom: `${targetPct}%` }} />
            {range.map((date) => {
              const d = dayMap[date];
              const h = d ? (d.totalSeconds / chartMax) * 100 : 0;
              const isToday = date === range[range.length - 1];
              const label = new Date(`${date}T12:00:00`);
              return (
                <button
                  key={date}
                  type="button"
                  className={`${styles.col} ${openDate === date ? styles.colActive : ''}`}
                  title={
                    d
                      ? `${label.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — ${fmtHM(d.totalSeconds)}`
                      : `${label.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — no work`
                  }
                  onClick={() => d && setOpenDate(openDate === date ? null : date)}
                >
                  <div className={styles.stack} style={{ height: `${h}%` }}>
                    {d?.slices.map((s) => (
                      <div key={s.account} style={{ flexGrow: s.seconds, background: colorOf(s.account) }} />
                    ))}
                  </div>
                  {range.length <= 14 || label.getDate() % 5 === 0 || isToday ? (
                    <span className={`${styles.colLabel} ${isToday ? styles.colToday : ''}`}>
                      {range.length <= 7
                        ? label.toLocaleDateString('en-US', { weekday: 'short' })
                        : label.getDate()}
                    </span>
                  ) : (
                    <span className={styles.colLabel}>&nbsp;</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── By account ── */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>By account</h3>
          </div>
          <div className={styles.accounts}>
            {summary.accounts.length === 0 && <p className={styles.muted}>No hours in this period.</p>}
            {summary.accounts.map((a) => (
              <div key={a.account} className={styles.accountRow}>
                <div className={styles.accountTop}>
                  <span className={styles.dot} style={{ background: colorOf(a.account) }} />
                  <span className={styles.accountName}>{a.account}</span>
                  <span className={styles.accountHours}>{fmtHM(a.seconds)}</span>
                  <span className={styles.accountPct}>{a.pct.toFixed(0)}%</span>
                </div>
                <div className={styles.accountBar}>
                  <div style={{ width: `${a.pct}%`, background: colorOf(a.account) }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Daily log ── */}
      <div className={`${shared.tableWrap} ${appt.wrap}`}>
        <table className={`${shared.table} ${appt.table}`}>
          <thead>
            <tr>
              <th>Day</th>
              <th className={styles.splitCol}>Accounts</th>
              <th>First in</th>
              <th>Last out</th>
              <th>Sessions</th>
              <th className={styles.right}>Total</th>
            </tr>
          </thead>
          <tbody>
            {!days.length && (
              <tr>
                <td colSpan={6} className={shared.tableEmpty}>
                  No worked time in this period.
                </td>
              </tr>
            )}
            {days.map((d) => {
              const open = openDate === d.date;
              const rel = relLabel(d.date);
              return (
                <React.Fragment key={d.date}>
                  <tr className={`${appt.row} ${open ? styles.rowOpen : ''}`} onClick={() => setOpenDate(open ? null : d.date)}>
                    <td>
                      <div className={styles.dayCell}>
                        <svg
                          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                        <span className={styles.dayName}>
                          {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {rel && <span className={`${appt.groupRel} ${rel === 'Today' ? appt.groupToday : ''}`}>{rel}</span>}
                      </div>
                    </td>
                    <td className={styles.splitCol}>
                      <div className={styles.split}>
                        {d.slices.map((s) => (
                          <div
                            key={s.account}
                            style={{ width: `${s.pct}%`, background: colorOf(s.account) }}
                            title={`${s.account}: ${fmtHM(s.seconds)}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className={styles.num}>{fmtClock(d.firstIn)}</td>
                    <td className={styles.num}>{d.lastOut ? fmtClock(d.lastOut) : '—'}</td>
                    <td className={styles.num}>{d.sessionCount}</td>
                    <td className={`${styles.num} ${styles.right}`}>
                      <strong>{fmtHM(d.totalSeconds)}</strong>
                      {d.totalSeconds >= TARGET_SECONDS && <span className={styles.metTarget} title="8h target met">✓</span>}
                    </td>
                  </tr>
                  {open && (
                    <tr className={styles.detailRow}>
                      <td colSpan={6}>
                        <div className={styles.detail}>
                          {d.slices.map((s) => (
                            <div key={s.account} className={styles.detailItem}>
                              <span className={styles.dot} style={{ background: colorOf(s.account) }} />
                              <span className={styles.accountName}>{s.account}</span>
                              <span className={styles.accountHours}>{fmtHM(s.seconds)}</span>
                              <span className={styles.accountPct}>{s.pct.toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
