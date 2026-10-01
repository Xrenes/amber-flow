import { useCallback, useEffect, useRef, useState } from 'react';
import {
  subscribeToCallSignals,
  openCallChannel,
  sendCallSignal,
  fetchTurnCredentials,
  getSupabase,
  METERED_APP_DOMAIN,
  METERED_API_KEY,
  type CallSignal,
} from '@amber-flow/shared';

// Confirms the sender of a listen-offer actually holds the admin/manager
// role before this client will auto-answer with mic audio. The signaling
// channel itself has no server-side permission check (broadcast, not RLS'd
// DB writes), so a forged listen-offer from a compromised/modified client
// could otherwise still get an answer — this at least stops any signed-in
// user from triggering it via the normal app, since profiles.role is the
// authoritative source RLS already protects writes to.
async function callerIsAdminOrManager(callerId: string): Promise<boolean> {
  try {
    const { data } = await getSupabase().from('profiles').select('role').eq('id', callerId).single();
    return data?.role === 'admin' || data?.role === 'manager';
  } catch {
    return false;
  }
}

export type CallState = 'idle' | 'ringing-out' | 'ringing-in' | 'connected' | 'ended';

interface IncomingCall {
  fromId: string;
  fromName: string;
  offer: RTCSessionDescriptionInit;
}

// Live WebRTC voice calls, admin/manager -> agent only. Signaling goes over
// a per-user Supabase Realtime broadcast channel (no server relay of media —
// only offer/answer/ICE messages); actual audio is peer-to-peer, or routed
// through a Metered.ca TURN relay when direct peer-to-peer isn't reachable
// (e.g. both sides behind different NATs). Falls back to STUN-only (may not
// connect on all networks) until METERED_APP_DOMAIN/METERED_API_KEY are set.
export function useCall(userId: string | undefined, userName: string) {
  const [state, setState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  // True on the admin's own side while the current session is a listen-in
  // they started (drives the overlay's "Listening…" wording instead of the
  // normal two-way call copy).
  const [isListening, setIsListening] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingChannelRef = useRef<ReturnType<typeof openCallChannel> | null>(null);
  const incomingSignalsRef = useRef<ReturnType<typeof subscribeToCallSignals> | null>(null);
  const remoteIdRef = useRef<string | null>(null);
  // True only on the callee side of a silent listen-in (set by
  // autoAnswerListen) — suppresses the hangup handler's visible state
  // change, since this agent must never see any UI for it.
  const isBeingListenedToRef = useRef(false);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (outgoingChannelRef.current) {
      getSupabase().removeChannel(outgoingChannelRef.current);
      outgoingChannelRef.current = null;
    }
    remoteIdRef.current = null;
    setMicLevel(0);
  }, []);

  async function getIceServers(): Promise<RTCIceServer[]> {
    const base: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (!METERED_APP_DOMAIN || !METERED_API_KEY) return base;
    try {
      const turn = await fetchTurnCredentials(METERED_APP_DOMAIN, METERED_API_KEY);
      return [...base, ...turn];
    } catch {
      return base; // degrade to STUN-only rather than failing the call outright
    }
  }

  function attachPeerConnection(pc: RTCPeerConnection, targetId: string) {
    pc.onicecandidate = (e) => {
      if (e.candidate && outgoingChannelRef.current) {
        sendCallSignal(outgoingChannelRef.current, {
          type: 'ice-candidate',
          fromId: userId!,
          candidate: e.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setState('connected');
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setError(pc.connectionState === 'failed' ? 'Call connection failed.' : null);
        endCall();
      }
    };
    remoteIdRef.current = targetId;
  }

  // Admin/manager side: start a call to an agent.
  const startCall = useCallback(
    async (targetId: string, targetName: string) => {
      if (!userId) return;
      setError(null);
      setState('ringing-out');
      setRemoteName(targetName);
      setIsListening(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        const iceServers = await getIceServers();
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const channel = openCallChannel(targetId);
        outgoingChannelRef.current = channel;
        attachPeerConnection(pc, targetId);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            sendCallSignal(channel, { type: 'offer', fromId: userId, fromName: userName, sdp: offer });
          }
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start call.');
        setState('idle');
        cleanup();
      }
    },
    [userId, userName, cleanup]
  );

  // Admin/manager side: silently listen to an agent's mic, no ring/notice on
  // their end. Receive-only — this side adds no local track, so nothing is
  // sent back to the agent; only their audio flows to the listener.
  const startListen = useCallback(
    async (targetId: string, targetName: string) => {
      if (!userId) return;
      setError(null);
      setState('ringing-out');
      setRemoteName(targetName);
      setIsListening(true);

      try {
        const iceServers = await getIceServers();
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        pc.addTransceiver('audio', { direction: 'recvonly' });

        const channel = openCallChannel(targetId);
        outgoingChannelRef.current = channel;
        attachPeerConnection(pc, targetId);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            sendCallSignal(channel, { type: 'listen-offer', fromId: userId, fromName: userName, sdp: offer });
          }
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start listening.');
        setState('idle');
        cleanup();
      }
    },
    [userId, userName, cleanup]
  );

  // Callee side (agent): silently auto-answer a listen-offer — no incoming-
  // call state, no ring, no UI change. Sends mic audio only; doesn't play
  // anything back (there's nothing to play — the listener sends no track).
  const autoAnswerListen = useCallback(
    async (signal: Extract<CallSignal, { type: 'listen-offer' }>) => {
      if (!userId) return;
      if (!(await callerIsAdminOrManager(signal.fromId))) return; // not admin/manager — refuse before ever prompting for mic access
      isBeingListenedToRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        const iceServers = await getIceServers();
        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const channel = openCallChannel(signal.fromId);
        outgoingChannelRef.current = channel;
        remoteIdRef.current = signal.fromId;
        pc.onicecandidate = (e) => {
          if (e.candidate && outgoingChannelRef.current) {
            sendCallSignal(outgoingChannelRef.current, {
              type: 'ice-candidate',
              fromId: userId,
              candidate: e.candidate.toJSON(),
            });
          }
        };

        await pc.setRemoteDescription(signal.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            sendCallSignal(channel, { type: 'answer', fromId: userId, sdp: answer });
          }
        });
      } catch {
        // Silent by design — no error surfaced to the agent for a listen-in.
        cleanup();
        isBeingListenedToRef.current = false;
      }
    },
    [userId, cleanup]
  );

  // Agent side: accept a ringing-in call.
  const answerCall = useCallback(async () => {
    if (!incomingCall || !userId) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const channel = openCallChannel(incomingCall.fromId);
      outgoingChannelRef.current = channel;
      attachPeerConnection(pc, incomingCall.fromId);

      await pc.setRemoteDescription(incomingCall.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sendCallSignal(channel, { type: 'answer', fromId: userId, sdp: answer });
        }
      });

      setRemoteName(incomingCall.fromName);
      setIncomingCall(null);
      setState('connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer call.');
      setIncomingCall(null);
      setState('idle');
      cleanup();
    }
  }, [incomingCall, userId, cleanup]);

  const declineCall = useCallback(() => {
    if (incomingCall && userId) {
      const channel = openCallChannel(incomingCall.fromId);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sendCallSignal(channel, { type: 'hangup', fromId: userId });
          getSupabase().removeChannel(channel);
        }
      });
    }
    setIncomingCall(null);
    setState('idle');
  }, [incomingCall, userId]);

  const endCall = useCallback(() => {
    if (outgoingChannelRef.current && userId && remoteIdRef.current) {
      sendCallSignal(outgoingChannelRef.current, { type: 'hangup', fromId: userId });
    }
    cleanup();
    setState('ended');
    setTimeout(() => setState('idle'), 1500);
    setRemoteName(null);
    setIsListening(false);
  }, [userId, cleanup]);

  // Listen for signals addressed to me (offers = incoming calls; answers/ICE
  // for a call I started; hangups from either side).
  useEffect(() => {
    if (!userId) return;

    async function handleSignal(signal: CallSignal) {
      if (signal.type === 'offer') {
        setIncomingCall({ fromId: signal.fromId, fromName: signal.fromName, offer: signal.sdp });
        setState('ringing-in');
        return;
      }
      if (signal.type === 'listen-offer') {
        await autoAnswerListen(signal);
        return;
      }
      if (signal.type === 'answer' && pcRef.current) {
        await pcRef.current.setRemoteDescription(signal.sdp);
        return;
      }
      if (signal.type === 'ice-candidate' && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(signal.candidate);
        } catch {
          /* candidate arrived before remote description was set — safe to drop */
        }
        return;
      }
      if (signal.type === 'hangup') {
        const wasBeingListenedTo = isBeingListenedToRef.current;
        cleanup();
        isBeingListenedToRef.current = false;
        if (wasBeingListenedTo) return; // silent — no visible state change on the agent's side
        setIncomingCall(null);
        setState('ended');
        setTimeout(() => setState('idle'), 1500);
        setRemoteName(null);
      }
    }

    const channel = subscribeToCallSignals(userId, handleSignal);
    incomingSignalsRef.current = channel;
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [userId, cleanup, autoAnswerListen]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    state,
    incomingCall,
    remoteName,
    error,
    micLevel,
    isListening,
    remoteAudioRef,
    startCall,
    startListen,
    answerCall,
    declineCall,
    endCall,
  };
}
