import { getSupabase } from '../supabaseClient';
import type { PresenceStatus } from '../types';

// Plugin registry (the "Plugin Store") — global on/off switches admin
// controls; read is open to everyone since every user needs to know which
// plugins are active (e.g. whether to run the presence heartbeat at all).

export async function listPlugins() {
  return getSupabase().from('plugins').select('*').order('name', { ascending: true });
}

export async function setPluginEnabled(id: string, enabled: boolean) {
  return getSupabase()
    .from('plugins')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export function subscribeToPlugins(onChange: () => void) {
  return getSupabase()
    .channel('plugins-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plugins' }, onChange)
    .subscribe();
}

// Presence — backs the Idle/Active Status plugin.

export async function upsertPresence(userId: string, status: PresenceStatus) {
  return getSupabase()
    .from('presence')
    .upsert(
      { user_id: userId, status, last_active: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
}

export async function listPresence() {
  return getSupabase().from('presence').select('*');
}

export function subscribeToPresence(onChange: () => void) {
  return getSupabase()
    .channel('presence-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' }, onChange)
    .subscribe();
}
