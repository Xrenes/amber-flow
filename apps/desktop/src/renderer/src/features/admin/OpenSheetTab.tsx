import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useTrackingSheetUrl } from './useTrackingSheetUrl';
import TrackingSheetPanel from './TrackingSheetPanel';
import styles from './OpenSheetTab.module.css';

// Moved out of AdminPage's topbar into its own "Tracking Sheet" tab — the
// topbar version worked but sat disconnected from Goal Attainment and
// Import/Export, which are also about the same external sheet. Grouping
// all three under one sidebar section reads as one coherent feature
// instead of three scattered, unrelated-looking controls. The edit-link
// button stays admin/manager-only, same restriction the topbar version had
// (this page is already admin/manager-only at the route level, and
// app_settings' RLS policy enforces the same role for the write itself —
// this check is defense-in-depth, not the only thing stopping a write).
export default function OpenSheetTab() {
  const { user } = useAuth();
  const trackingSheet = useTrackingSheetUrl();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    setDraft(trackingSheet.url || '');
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    const ok = await trackingSheet.updateUrl(draft.trim());
    if (!ok) {
      setSaveError('That doesn’t look like a valid link — it must start with http:// or https://.');
      return;
    }
    setEditing(false);
  }

  if (trackingSheet.loading) return <p className={styles.hint}>Loading…</p>;

  return (
    <div>
      <p className={styles.intro}>
        View or open the team's external tracking spreadsheet without leaving Amber Flow.
      </p>

      {editing ? (
        <div className={styles.editRow}>
          <input
            className={styles.urlInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/…"
            autoFocus
          />
          <button className={styles.primaryBtn} onClick={handleSave}>
            Save
          </button>
          <button className={styles.ghostBtn} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.cardTitle}>Tracking Sheet</div>
            <div className={styles.cardUrl}>{trackingSheet.url || 'No link set yet'}</div>
          </div>
          <div className={styles.cardActions}>
            {trackingSheet.url && (
              <>
                <button className={styles.ghostBtn} onClick={() => setPanelOpen(true)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                  </svg>
                  View Here
                </button>
                <a className={styles.ghostBtn} href={trackingSheet.url} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3h7v7" />
                    <path d="M10 14L21 3" />
                    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                  </svg>
                  Open in Browser
                </a>
              </>
            )}
            {canEdit && (
              <button className={styles.iconOnlyBtn} title="Change tracking sheet link" onClick={startEdit}>
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {saveError && <p className={styles.errorText}>{saveError}</p>}

      {panelOpen && trackingSheet.url && <TrackingSheetPanel url={trackingSheet.url} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
