import React from 'react';
import PluginDataModal from '../plugins/PluginDataModal';
import type { AdminData } from './useAdminData';
import type { Plugin } from '@amber-flow/shared';
import styles from './PluginStoreTab.module.css';

// Plugins with a live activity_logs stream worth drilling into — see
// PLUGIN_ACTION_TYPES in PluginDataModal.tsx for the exact action_types
// each one filters on. idle-status shows live presence instead of a log
// feed (handled inside the modal). productivity-reports has no live
// stream (it's a computed report, not a log) — clicking it jumps to its
// own admin tab instead of opening this modal.
const LIVE_DATA_PLUGINS = new Set(['idle-status', 'screen-activity', 'mobile-qr-checkin']);

const ICONS: Record<string, React.ReactNode> = {
  'idle-status': (
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  'productivity-reports': (
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18.7 8l-5.1 5.1-3-3L3 17.3" />
    </svg>
  ),
  'screen-activity': (
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  'mobile-qr-checkin': (
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <line x1="14" y1="14" x2="14" y2="21" />
      <line x1="21" y1="14" x2="21" y2="21" />
      <line x1="14" y1="17.5" x2="21" y2="17.5" />
    </svg>
  ),
};

interface PluginStoreTabProps {
  data: AdminData;
  plugins: Plugin[];
  loading: boolean;
  toggle: (id: string, enabled: boolean) => void;
  onOpenReports?: () => void;
}

// Admin-only "store" of built-in monitoring capabilities — each ships with
// the app (not dynamically loaded), presented as a grid of togglable cards.
// Every plugin here is visible to agents when active (no silent tracking).
// Clicking a card with a live data stream opens PluginDataModal; clicking
// productivity-reports (no live stream — it's a computed report) jumps to
// its own admin tab instead via onOpenReports. plugins/loading/toggle come
// from AdminPage's single usePlugins() instance rather than calling the
// hook again here — see OverviewTab.tsx's comment for why a second
// instance throws.
export default function PluginStoreTab({ data, plugins, loading, toggle, onOpenReports }: PluginStoreTabProps) {
  const [openPluginId, setOpenPluginId] = React.useState<string | null>(null);

  if (loading) return <p className={styles.hint}>Loading…</p>;

  const openPlugin = plugins.find((p) => p.id === openPluginId);

  function handleCardClick(id: string) {
    if (id === 'productivity-reports') {
      onOpenReports?.();
    } else if (LIVE_DATA_PLUGINS.has(id)) {
      setOpenPluginId(id);
    }
  }

  return (
    <div>
      <p className={styles.intro}>
        Turn features on or off for your whole team. Agents always see when a feature that affects
        them is active. Click a card to view its live data.
      </p>
      <div className={styles.grid}>
        {plugins.map((p) => {
          const clickable = LIVE_DATA_PLUGINS.has(p.id) || p.id === 'productivity-reports';
          return (
            <div
              key={p.id}
              className={`${styles.card} ${clickable ? styles.cardClickable : ''}`}
              onClick={clickable ? () => handleCardClick(p.id) : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <div className={styles.cardIcon}>{ICONS[p.id] || null}</div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>{p.name}</div>
                <div className={styles.cardDesc}>{p.description}</div>
              </div>
              <label className={styles.toggle} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                />
                <span className={styles.slider} />
              </label>
            </div>
          );
        })}
      </div>

      {openPlugin && (
        <PluginDataModal
          pluginId={openPlugin.id}
          pluginName={openPlugin.name}
          data={data}
          onClose={() => setOpenPluginId(null)}
        />
      )}
    </div>
  );
}
