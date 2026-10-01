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

// If the browser can't open the realtime WebSocket (a strict Content-
// Security-Policy, an ad blocker, a corporate firewall), supabase-js throws
// "WebSocket not available" synchronously from channel.subscribe(), which
// would crash whatever screen subscribed. Live updates are a nice-to-have —
// data still loads and saves over HTTPS — so degrade to "not live" instead.
function hardenRealtime(c: Client): Client {
  const origChannel = c.channel.bind(c);
  c.channel = ((name: string, opts?: Parameters<Client['channel']>[1]) => {
    const ch = origChannel(name, opts);
    const origSubscribe = ch.subscribe.bind(ch);
    ch.subscribe = ((callback?: Parameters<typeof ch.subscribe>[0], timeout?: number) => {
      try {
        return origSubscribe(callback, timeout);
      } catch (err) {
        console.warn(`[amber-flow] live updates unavailable for "${name}":`, err);
        try {
          callback?.('CHANNEL_ERROR' as Parameters<NonNullable<typeof callback>>[0], err as Error);
        } catch {
          /* ignore */
        }
        return ch;
      }
    }) as typeof ch.subscribe;
    return ch;
  }) as Client['channel'];

  const origRemove = c.removeChannel.bind(c);
  c.removeChannel = ((ch: Parameters<Client['removeChannel']>[0]) => {
    try {
      return origRemove(ch);
    } catch {
      return Promise.resolve('error' as const);
    }
  }) as Client['removeChannel'];
  return c;
}

// Desktop (Electron/browser) has synchronous localStorage; React Native needs
// an injected async storage (e.g. @react-native-async-storage/async-storage).
// Call this once at app startup before using `supabase`.
export function initSupabase(storage?: AsyncStorageLike) {
  const options: SupabaseClientOptions<'public'> = storage
    ? { auth: { storage: storage as any, autoRefreshToken: true, persistSession: true } }
    : {};
  client = hardenRealtime(createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, options));
  return client;
}

export function getSupabase(): Client {
  if (!client) {
    // Falls back to default (browser localStorage) if init wasn't called explicitly.
    client = hardenRealtime(createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return client;
}
