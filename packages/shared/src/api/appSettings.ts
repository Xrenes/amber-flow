import { getSupabase } from '../supabaseClient';

// Generic key/value config store — read open to everyone, write admin/
// manager only. See migrations/014_app_settings.sql.

export async function getAppSetting(key: string): Promise<string | null> {
  const { data } = await getSupabase().from('app_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

export async function setAppSetting(key: string, value: string) {
  return getSupabase()
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

let appSettingsChannelSeq = 0;

// A unique channel name per call — app_settings now has several concurrent
// subscribers (Tracking Sheet URL, Time Tracking Policy, the Time
// Tracker's own policy read, …). Supabase's channel(name) returns the
// same object for a repeated name, and adding a postgres_changes listener
// to a channel that's already subscribed throws, so a single shared name
// broke the moment a second subscriber showed up. Each caller already
// removes its own channel on cleanup (getSupabase().removeChannel), so
// nothing leaks.
export function subscribeToAppSettings(onChange: () => void) {
  return getSupabase()
    .channel(`app-settings-changes-${++appSettingsChannelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, onChange)
    .subscribe();
}
