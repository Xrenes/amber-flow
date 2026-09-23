import { useCallback, useEffect, useState } from 'react';
import { listPlugins, setPluginEnabled, subscribeToPlugins, getSupabase } from '@amber-flow/shared';
import type { Plugin } from '@amber-flow/shared';
import { isDemoMode, demoPlugins } from '../../demo/demoData';

// Loads the plugin registry and keeps it live via realtime — used both by
// the Admin Panel's Plugin Store tab (to toggle) and by feature hooks
// elsewhere in the app (to check whether a given plugin is enabled).
export function usePlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>(isDemoMode() ? demoPlugins : []);
  const [loading, setLoading] = useState(!isDemoMode());

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setPlugins((prev) => (prev.length ? prev : demoPlugins));
      setLoading(false);
      return;
    }
    const { data } = await listPlugins();
    if (data) setPlugins(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isDemoMode()) {
      refresh();
      return;
    }
    refresh();
    const channel = subscribeToPlugins(() => refresh());
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [refresh]);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    if (isDemoMode()) {
      setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, enabled } : p)));
      return;
    }
    await setPluginEnabled(id, enabled);
  }, []);

  const isEnabled = useCallback((id: string) => plugins.find((p) => p.id === id)?.enabled ?? false, [plugins]);

  return { plugins, loading, toggle, isEnabled, refresh };
}
