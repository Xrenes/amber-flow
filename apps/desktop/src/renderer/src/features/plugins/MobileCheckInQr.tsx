import React from 'react';
import { useLoginQr } from './useLoginQr';
import styles from './MobileCheckInQr.module.css';

interface MobileCheckInQrProps {
  userId: string | undefined;
  enabled: boolean;
}

// Shown on the main dashboard when admin/manager has turned on the "Mobile
// QR Check-in" plugin. The agent scans this with the Amber Flow mobile app
// to start/pause/resume their OWN Tracker session — proves they're
// physically at this desktop rather than just tapping a button on their
// phone. See migrations/012_desktop_qr_tracker_login.sql for how a scan is
// resolved back to this exact user server-side.
export default function MobileCheckInQr({ userId, enabled }: MobileCheckInQrProps) {
  const { qrDataUrl, loading } = useLoginQr(userId, enabled);

  if (!enabled) return null;

  return (
    <div className={styles.card}>
      <div className={styles.textCol}>
        <div className={styles.title}>Mobile Check-in</div>
        <p className={styles.hint}>
          Scan with the Amber Flow mobile app to start, pause, or resume your Tracker from your phone.
        </p>
      </div>
      <div className={styles.qrWrap}>
        {loading && !qrDataUrl && <div className={styles.placeholder}>Generating…</div>}
        {qrDataUrl && <img src={qrDataUrl} alt="Scan to check in from mobile" className={styles.qrImg} />}
      </div>
    </div>
  );
}
