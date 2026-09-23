import { useCallback, useEffect, useState } from 'react';
import { listPlugins, setPluginEnabled, subscribeToPlugins, getSupabase } from '@amber-flow/shared';
import type { Plugin } from '@amber-flow/shared';

// Loads the plugin registry and keeps it live via realtime — used both by
// the Admin Panel's Plugin Store tab (to toggle) and by feature hooks
// elsewhere in the app (to check whether a given plugin is enabled).
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

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    await setPluginEnabled(id, enabled);
  }, []);

  const isEnabled = useCallback((id: string) => plugins.find((p) => p.id === id)?.enabled ?? false, [plugins]);

  return { plugins, loading, toggle, isEnabled, refresh };
}
