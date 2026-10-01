import React from 'react';
import type { AdminData } from '../admin/useAdminData';
import { usePresenceMap } from './usePresenceMap';
import styles from './PluginDataModal.module.css';

interface PluginDataModalProps {
  pluginId: string;
  pluginName: string;
  data: AdminData;
  onClose: () => void;
}

// Which activity_logs action_types belong to each plugin's data stream —
// drives both the filter and the human-readable label. Plugins with no
// entry here (e.g. productivity-reports, which is a computed report, not a
// log) don't get a "View Data" affordance in PluginStoreTab.
const PLUGIN_ACTION_TYPES: Record<string, Record<string, string>> = {
  'screen-activity': {
    SCREEN_ON: 'Screen turned on',
    SCREEN_OFF: 'Screen turned off',
    APP_FOREGROUND: 'Opened Amber Flow (iOS)',
    APP_BACKGROUND: 'Left Amber Flow (iOS)',
  },
  'mobile-qr-checkin': {
    START_TRACKER: 'Started tracker',
    STOP_TRACKER: 'Stopped tracker',
    RESUME_TRACKER: 'Resumed tracker',
    START_BREAK: 'Paused tracker',
    END_BREAK: 'Resumed from pause',
  },
};

function fmtTs(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export default function PluginDataModal({ pluginId, pluginName, data, onClose }: PluginDataModalProps) {
  const { profileMap } = data;
  const presence = usePresenceMap();

  const actionLabels = PLUGIN_ACTION_TYPES[pluginId];

  // mobile-qr-checkin cares only about QR-triggered events (via: 'qr' in
  // metadata) — button-triggered starts/pauses belong to every agent's
  // normal tracker use, not to this plugin's own signal. See
  // useTimeTracker.ts's `via` parameter.
  const rows = actionLabels
    ? data.logs.filter((log) => {
        if (!actionLabels[log.action_type]) return false;
        if (pluginId === 'mobile-qr-checkin') {
          const meta = (log.metadata || {}) as Record<string, unknown>;
          return meta.via === 'qr';
        }
        return true;
      })
    : [];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>{pluginName}</div>
            <div className={styles.subtitle}>Live data this feature is collecting</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {pluginId === 'idle-status' && (
          <div className={styles.presenceGrid}>
            {Object.keys(profileMap).length === 0 && <p className={styles.empty}>No agents yet.</p>}
            {Object.values(profileMap).map((p) => {
              const status = presence.statusFor(p.id);
              return (
                <div key={p.id} className={styles.presenceCard}>
                  <span className={`${styles.dot} ${status ? styles[status] : ''}`} />
                  <span className={styles.presenceName}>{p.name}</span>
                  <span className={styles.presenceStatus}>{status || 'unknown'}</span>
                </div>
              );
            })}
          </div>
        )}

        {actionLabels && (
          <div className={styles.feed}>
            {rows.length === 0 && <p className={styles.empty}>No events logged yet. Data will appear here in real time.</p>}
            {rows.slice(0, 200).map((log) => {
              const profile = profileMap[log.user_id];
              return (
                <div key={log.id} className={styles.feedItem}>
                  <span className={styles.feedAgent}>{profile?.name || 'Unknown'}</span>
                  <span className={styles.feedAction}>{actionLabels[log.action_type] || log.action_type}</span>
                  <span className={styles.feedTs}>{fmtTs(log.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
