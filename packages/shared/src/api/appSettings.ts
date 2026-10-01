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

export function subscribeToAppSettings(onChange: () => void) {
  return getSupabase()
    .channel('app-settings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, onChange)
    .subscribe();
}
