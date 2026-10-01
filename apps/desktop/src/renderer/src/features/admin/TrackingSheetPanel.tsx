import React from 'react';
import styles from './TrackingSheetPanel.module.css';

interface Props {
  url: string;
  onClose: () => void;
}

// In-app view of the team's tracking Google Sheet via Electron's <webview>
// tag (webviewTag: true set in src/main/index.ts). This is a genuine
// attempt at a LIVE, EDITABLE embed of the real edit URL — not the
// read-only "publish to web" embed — so it depends on Google accepting a
// sign-in inside an embedded webview, which Google's own security checks
// sometimes block for embedded/automation-flagged browser contexts. If the
// user sees a "this browser may not be secure" error here instead of the
// sheet, that's Google refusing the embedded session, not a bug in this
// panel — the "Open in Browser" fallback (AdminPage's external link) always
// works since it's the user's real, already-authenticated browser.
export default function TrackingSheetPanel({ url, onClose }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>Tracking Sheet</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <webview src={url} className={styles.webview} partition="persist:tracking-sheet" allowpopups="true" />
      </div>
    </div>
  );
}
