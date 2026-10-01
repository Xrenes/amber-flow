import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ensureLoginQrToken } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';

// Generates this user's check-in token once (on mount / login — session-
// long by design, not rotated on a timer) and renders it as a QR data URL
// for MobileCheckInQr. A fresh token is only issued the next time this hook
// mounts (i.e. next login), matching migration 012's upsert-on-login model.
export function useLoginQr(userId: string | undefined, enabled: boolean) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) {
      setQrDataUrl(null);
      return;
    }
    if (isDemoMode()) {
      // No real Supabase row to scan against in demo mode — render a
      // placeholder payload just so the card isn't empty.
      QRCode.toDataURL(`amberflow://checkin/demo`, { margin: 1, width: 220 }).then(setQrDataUrl).catch(() => {});
      return;
    }

    let cancelled = false;
    setLoading(true);
    ensureLoginQrToken(userId)
      .then((token) => {
        if (cancelled || !token) return;
        return QRCode.toDataURL(`amberflow://checkin/${token}`, { margin: 1, width: 220 }).then((url) => {
          if (!cancelled) setQrDataUrl(url);
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return { qrDataUrl, loading };
}
