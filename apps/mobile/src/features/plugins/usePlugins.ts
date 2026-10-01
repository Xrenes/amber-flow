import { useCallback, useEffect, useState } from 'react';
import { listPlugins, subscribeToPlugins, getSupabase } from '@amber-flow/shared';
import type { Plugin } from '@amber-flow/shared';

// Mobile port of the desktop usePlugins hook — reads the same global
// `plugins` registry admin/manager toggle from the desktop Plugin Store, so
// a feature enabled there (e.g. Phone Screen Activity) takes effect here
// without a separate mobile-side toggle. No other mobile screen subscribes
// to this table, so a single Realtime subscription here is safe (doesn't
// hit the duplicate-subscription issue that applies to tasks/appointments/
// sessions, which are already owned by other always-mounted tabs).
export function usePlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await listPlugins();
    if (data) setPlugins(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = subscribeToPlugins(() => refresh());
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [refresh]);

  const isEnabled = useCallback((id: string) => plugins.find((p) => p.id === id)?.enabled ?? false, [plugins]);

  return { plugins, loading, isEnabled };
}
