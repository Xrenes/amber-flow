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

// Username + password sign in (matches the live web app's "Sign In as Team
// Member" flow — login.html's teamLoginBtn handler). profiles.username isn't
// queryable by an unauthenticated visitor under RLS, so the Worker resolves
// username -> email + checks the password itself with the service key, then
// returns a Supabase magic-link email+token pair (NOT a ready session) for
// the client to exchange via verifyOtp. This must match the Worker's actual
// route/response shape exactly — an earlier version of this function called
// a different endpoint (/username-login) expecting a ready access/refresh
// token pair, which the deployed Worker never returned, so every real
// username login failed with a generic "Invalid username or password"
// regardless of whether the credentials were correct.
export async function signInWithUsername(username: string, password: string) {
  const res = await fetch(`${WORKER_URL}/internal-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Network error.' }));
  if (!data.ok || !data.email || !data.token) {
    return { data: { user: null, session: null }, error: { message: data.error || 'Invalid username or password.' } };
  }
  return verifyMagicLinkOtp(data.email, data.token);
}

// TEMPORARY dev bridge: direct Supabase email+password sign-in, for testing
// against the live database before the Worker (which /username-login needs)
// is deployed. Bypasses the username->email lookup entirely — the email
// must be a real one set on a user created via Supabase Dashboard ->
// Authentication -> Users. Remove once /username-login is live everywhere.
export async function signInWithEmail(email: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email, password });
}
