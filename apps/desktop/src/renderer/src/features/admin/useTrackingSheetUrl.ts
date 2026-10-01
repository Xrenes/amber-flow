import { useEffect, useState } from 'react';
import { getAppSetting, setAppSetting, subscribeToAppSettings, getSupabase } from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';

const SETTING_KEY = 'tracking_sheet_url';

// Only http(s) links are allowed — the value is rendered as a live <a href>
// that Electron's setWindowOpenHandler hands to shell.openExternal, so an
// unvalidated scheme (javascript:, file:, a custom OS-registered handler,
// etc.) stored here could do more than open a browser tab. Enforced both on
// write (so a bad value never reaches app_settings) and on read (in case a
// bad value is already there, e.g. from before this check existed).
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

// Reads/writes the external Google Sheet link from app_settings (see
// migrations/014_app_settings.sql) — lets admin repoint or clear the link
// from the Admin Panel without a code change.
export function useTrackingSheetUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isDemoMode());

  useEffect(() => {
    if (isDemoMode()) {
      setUrl('https://docs.google.com/spreadsheets/d/1i8AjI3ZgQZ55ROZ_rRIssaSXzZtljYT0zN3R9icsmMQ/edit');
      setLoading(false);
      return;
    }
    let cancelled = false;
    function refresh() {
      getAppSetting(SETTING_KEY).then((value) => {
        if (cancelled) return;
        setUrl(isSafeHttpUrl(value) ? value : null);
        setLoading(false);
      });
    }
    refresh();
    const channel = subscribeToAppSettings(refresh);
    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, []);

  async function updateUrl(next: string): Promise<boolean> {
    if (!isSafeHttpUrl(next)) return false;
    if (isDemoMode()) {
      setUrl(next);
      return true;
    }
    await setAppSetting(SETTING_KEY, next);
    return true;
  }

  return { url, loading, updateUrl };
}
