import React from 'react';
import type { AdminData } from './useAdminData';
import { usePlugins } from '../plugins/usePlugins';
import { usePresenceMap } from '../plugins/usePresenceMap';
import styles from './AdminShared.module.css';

interface Props {
  data: AdminData;
}

// Ports admin.js's renderOverview(): per-agent time-tracked / appointment
// stats cards. The 5 top KPI cards (kpiAgents/kpiHours/kpiAppts/kpiDone/
// kpiTgConnected) live in AdminPage since they're shared header chrome, not
// part of this tab's panel in admin.html.
export default function OverviewTab({ data }: Props) {
  const { profiles, appointments, sessions } = data;
  const { isEnabled } = usePlugins();
  const { statusFor } = usePresenceMap();
  const presenceOn = isEnabled('idle-status');

  if (!profiles.length) {
    return <p className={styles.feedPlaceholder}>No agents found yet.</p>;
  }

  const stats: Record<string, { totalSec: number; apptTotal: number; apptDone: number; apptMissed: number }> = {};
  profiles.forEach((p) => {
    stats[p.id] = { totalSec: 0, apptTotal: 0, apptDone: 0, apptMissed: 0 };
  });
  sessions.forEach((s) => {
    if (stats[s.user_id]) stats[s.user_id].totalSec += s.duration_seconds || 0;
  });
  appointments.forEach((a) => {
    if (!stats[a.user_id]) return;
    stats[a.user_id].apptTotal++;
    if (a.status === 'completed') stats[a.user_id].apptDone++;
    if (a.status === 'missed') stats[a.user_id].apptMissed++;
  });

  return (
    <div className={styles.agentCards}>
      {profiles.map((p) => {
        const s = stats[p.id];
        const h = Math.floor(s.totalSec / 3600);
        const m = Math.floor((s.totalSec % 3600) / 60);
        const pct = s.apptTotal > 0 ? Math.round((s.apptDone / s.apptTotal) * 100) : null;
        const pctClass = pct === null ? '' : pct === 100 ? 'success' : pct >= 60 ? 'accent' : 'danger';
        const initials = (p.name || '?')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        return (
          <div key={p.id} className={styles.agentCard}>
            <div className={styles.agentCardTop}>
              <div className={styles.agentAvatar}>{initials}</div>
              <div>
                <div className={styles.agentCardName}>{p.name || 'Unknown'}</div>
                <div className={styles.agentCardMeta}>
                  <span className={`${styles.roleBadge} ${styles[p.role] || ''}`}>{p.role || 'agent'}</span>
                  {presenceOn && (
                    <span
                      className={`${styles.tgDot} ${statusFor(p.id) === 'active' ? styles.connected : ''}`}
                      title={
                        statusFor(p.id) === 'active'
                          ? 'Active now'
                          : statusFor(p.id) === 'idle'
                            ? 'Idle'
                            : statusFor(p.id) === 'away'
                              ? 'Away'
                              : 'No status reported yet'
                      }
                    />
                  )}
                </div>
              </div>
            </div>
            <div className={styles.agentStats}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Time tracked</span>
                <span className={`${styles.statVal} ${styles.accent}`}>
                  {h}h {m}m
                </span>
              </div>
              <div className={styles.agentDivider} />
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Appointments</span>
                <span className={styles.statVal}>{s.apptTotal}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Completed</span>
                <span className={`${styles.statVal} ${styles.success}`}>{s.apptDone}</span>
              </div>
              {s.apptMissed > 0 && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Missed</span>
                  <span className={`${styles.statVal} ${styles.danger}`}>{s.apptMissed}</span>
                </div>
              )}
              {pct !== null && (
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Done rate</span>
                  <span className={`${styles.statVal} ${styles[pctClass] || ''}`}>{pct}%</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
