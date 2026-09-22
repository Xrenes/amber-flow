import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import type { Database } from './database.types';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

type Client = ReturnType<typeof createClient<Database>>;

let client: Client | null = null;

// Desktop (Electron/browser) has synchronous localStorage; React Native needs
// an injected async storage (e.g. @react-native-async-storage/async-storage).
// Call this once at app startup before using `supabase`.
export function initSupabase(storage?: AsyncStorageLike) {
  const options: SupabaseClientOptions<'public'> = storage
    ? { auth: { storage: storage as any, autoRefreshToken: true, persistSession: true } }
    : {};
  client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, options);
  return client;
}

export function getSupabase(): Client {
  if (!client) {
    // Falls back to default (browser localStorage) if init wasn't called explicitly.
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
