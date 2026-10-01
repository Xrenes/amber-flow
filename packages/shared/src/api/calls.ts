import { getSupabase } from '../supabaseClient';

// WebRTC signaling over a per-user Supabase Realtime broadcast channel — no
// database table needed for the signaling messages themselves (they're
// transient), just a well-known channel name each user subscribes to while
// the app is open. Channel is named by the *callee* so the caller always
// knows where to send the initial offer.
function userCallChannel(userId: string) {
  return getSupabase().channel(`call-${userId}`, { config: { broadcast: { self: false } } });
}

export type CallSignal =
  | { type: 'offer'; fromId: string; fromName: string; sdp: RTCSessionDescriptionInit }
  // Silent one-way listen-in: same offer/answer/ICE/hangup plumbing as a
  // normal call, but the callee auto-answers with no ring/incoming-call UI
  // and sends audio only (doesn't add a remote track) — see useSilentListen.
  | { type: 'listen-offer'; fromId: string; fromName: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; fromId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; fromId: string; candidate: RTCIceCandidateInit }
  | { type: 'hangup'; fromId: string };

// Callee-side: listen for incoming offers/candidates/hangups addressed to me.
export function subscribeToCallSignals(userId: string, onSignal: (signal: CallSignal) => void) {
  const channel = userCallChannel(userId);
  channel.on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload as CallSignal));
  channel.subscribe();
  return channel;
}

// Caller-side: send a signal to a specific user's channel. Since the
// broadcast channel must be subscribed to send on it too, this opens a
// short-lived channel, sends, then the caller keeps it open for the
// duration of the call (return value) so ICE candidates can keep flowing.
export function openCallChannel(targetUserId: string) {
  const channel = userCallChannel(targetUserId);
  channel.subscribe();
  return channel;
}

export function sendCallSignal(channel: ReturnType<typeof openCallChannel>, signal: CallSignal) {
  channel.send({ type: 'broadcast', event: 'signal', payload: signal });
}

// Metered.ca TURN credentials — fetched fresh per call rather than hardcoded,
// since Metered issues short-lived username/credential pairs per their API.
// `appDomain` is the subdomain Metered assigns your account (shown on their
// dashboard, e.g. "your-app-name") and `apiKey` is your account's API key —
// both set via METERED_APP_DOMAIN / METERED_API_KEY once the account exists
// (see packages/shared/src/config.ts). Falls back to STUN-only (no relay)
// if either is unset, so calling still works on compatible networks.
export async function fetchTurnCredentials(appDomain: string, apiKey: string): Promise<RTCIceServer[]> {
  const res = await fetch(`https://${appDomain}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`);
  if (!res.ok) throw new Error('Failed to fetch TURN credentials');
  return res.json();
}
