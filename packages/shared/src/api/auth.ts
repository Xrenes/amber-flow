import { getSupabase } from '../supabaseClient';
import { WORKER_URL } from '../config';

// Accounts aren't tied to a real email — the Telegram Chat ID is normalized
// to digits and mapped to a synthetic address, matching the legacy web app
// (login.html: normalizeChatId / chatIdToEmail) so existing accounts keep working.
export function normalizeChatId(chatId: string) {
  return chatId.replace(/\D/g, '');
}

export function chatIdToEmail(chatId: string) {
  return `${normalizeChatId(chatId)}@tg.amberflow.internal`;
}

export async function getSession() {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

// Chat-ID + password sign in (main "Sign In" tab).
export async function signInWithChatId(chatId: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email: chatIdToEmail(chatId), password });
}

// Final step of registration, after OTP has been verified via the Worker.
export async function signUpWithChatId(chatId: string, password: string, name: string) {
  return getSupabase().auth.signUp({
    email: chatIdToEmail(chatId),
    password,
    options: { data: { name, telegram_chat_id: normalizeChatId(chatId) } },
  });
}

// Team/internal login: Worker validates fixed credentials and returns a
// Supabase magic-link email+token pair, which is then exchanged here.
export async function verifyMagicLinkOtp(email: string, token: string) {
  return getSupabase().auth.verifyOtp({ email, token, type: 'magiclink' });
}

export async function ensureProfile(userId: string, name: string) {
  return getSupabase()
    .from('profiles')
    .upsert({ id: userId, name }, { onConflict: 'id', ignoreDuplicates: true });
}

export async function getProfile(userId: string) {
  return getSupabase()
    .from('profiles')
    .select('telegram_chat_id, name, role')
    .eq('id', userId)
    .single();
}

// Username + password sign in. profiles.username isn't queryable by an
// unauthenticated visitor under RLS, so the Worker resolves username -> email
// with the service key; the real password check still happens here via
// Supabase's own signInWithPassword.
export async function signInWithUsername(username: string, password: string) {
  const res = await fetch(`${WORKER_URL}/username-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Network error.' }));
  if (!data.ok || !data.email) {
    return { data: { user: null, session: null }, error: { message: data.error || 'Invalid username or password.' } };
  }
  return getSupabase().auth.signInWithPassword({ email: data.email, password });
}
