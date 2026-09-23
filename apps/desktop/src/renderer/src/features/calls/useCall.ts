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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingChannelRef = useRef<ReturnType<typeof openCallChannel> | null>(null);
  const incomingSignalsRef = useRef<ReturnType<typeof subscribeToCallSignals> | null>(null);
  const remoteIdRef = useRef<string | null>(null);

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
        cleanup();
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
  }, [userId, cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    state,
    incomingCall,
    remoteName,
    error,
    micLevel,
    remoteAudioRef,
    startCall,
    answerCall,
    declineCall,
    endCall,
  };
}
