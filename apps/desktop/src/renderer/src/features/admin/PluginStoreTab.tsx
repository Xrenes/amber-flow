import React from 'react';
import { usePlugins } from '../plugins/usePlugins';
import styles from './PluginStoreTab.module.css';

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
};

// Admin-only "store" of built-in monitoring capabilities — each ships with
// the app (not dynamically loaded), presented as a grid of togglable cards.
// Every plugin here is visible to agents when active (no silent tracking).
export default function PluginStoreTab() {
  const { plugins, loading, toggle } = usePlugins();

  if (loading) return <p className={styles.hint}>Loading…</p>;

  return (
    <div>
      <p className={styles.intro}>
        Turn features on or off for your whole team. Agents always see when a feature that affects
        them is active.
      </p>
      <div className={styles.grid}>
        {plugins.map((p) => (
          <div key={p.id} className={styles.card}>
            <div className={styles.cardIcon}>{ICONS[p.id] || null}</div>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}>{p.name}</div>
              <div className={styles.cardDesc}>{p.description}</div>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              <span className={styles.slider} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
