import { WORKER_URL } from '../config';

interface OkResponse {
  ok: boolean;
  error?: string;
}

async function postJson<T extends OkResponse = OkResponse>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: 'Network error.' } as T));
}

// --- Telegram / activity (used post-login, from the main app) ---

export function sendTelegramMessage(chatId: string, text: string) {
  return postJson('/send-tg', { chatId, text });
}

export function registerBotUser(chatId: string, userId: string) {
  return postJson('/register-bot-user', { chatId, userId });
}

export function logActivity(userId: string, action: string, metadata?: Record<string, unknown>) {
  return postJson('/log-activity', { userId, action, metadata });
}

// --- Auth / onboarding flows (used from the login screen) ---
// chatId is the user-facing identifier throughout; Supabase email/password
// auth happens client-side via chatIdToEmail() (see ./auth.ts).

export function sendOtp(chatId: string) {
  return postJson('/send-otp', { chatId });
}

export function verifyOtp(chatId: string, otp: string) {
  return postJson('/verify-otp', { chatId, otp });
}

// Silently upgrades the just-created user to 'admin' if the code is valid;
// caller should not surface success/failure to avoid leaking which codes exist.
export function verifyInviteCode(code: string, userId: string) {
  return postJson('/verify-invite-code', { code, userId });
}

export function internalLogin(username: string, password: string) {
  return postJson<OkResponse & { email?: string; token?: string; name?: string }>(
    '/internal-login',
    { username, password }
  );
}

export function verifyOtpForPasswordReset(chatId: string, otp: string) {
  return postJson('/verify-otp-pwreset', { chatId, otp });
}

// Only valid within the 10-minute window opened by verifyOtpForPasswordReset.
export function resetPassword(chatId: string, newPassword: string) {
  return postJson('/reset-password', { chatId, newPassword });
}
