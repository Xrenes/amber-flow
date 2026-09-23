import React from 'react';
import type { CallState } from './useCall';
import styles from './CallOverlay.module.css';

interface Props {
  state: CallState;
  remoteName: string | null;
  incomingFromName?: string;
  error: string | null;
  onAnswer: () => void;
  onDecline: () => void;
  onEnd: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

// Full-screen call UI — covers ringing-out (admin waiting for agent to
// pick up), ringing-in (agent's incoming-call prompt), and connected states.
export default function CallOverlay({
  state,
  remoteName,
  incomingFromName,
  error,
  onAnswer,
  onDecline,
  onEnd,
  audioRef,
}: Props) {
  if (state === 'idle') return null;

  return (
    <div className={styles.overlay}>
      <audio ref={audioRef} autoPlay />
      <div className={styles.card}>
        <div className={styles.avatar}>
          {((state === 'ringing-in' ? incomingFromName : remoteName) || '?').charAt(0).toUpperCase()}
        </div>

        {state === 'ringing-out' && (
          <>
            <div className={styles.name}>{remoteName}</div>
            <div className={styles.status}>Calling…</div>
            <button type="button" className={styles.declineBtn} onClick={onEnd}>
              Cancel
            </button>
          </>
        )}

        {state === 'ringing-in' && (
          <>
            <div className={styles.name}>{incomingFromName}</div>
            <div className={styles.status}>Incoming call…</div>
            <div className={styles.actions}>
              <button type="button" className={styles.declineBtn} onClick={onDecline}>
                Decline
              </button>
              <button type="button" className={styles.answerBtn} onClick={onAnswer}>
                Answer
              </button>
            </div>
          </>
        )}

        {state === 'connected' && (
          <>
            <div className={styles.name}>{remoteName}</div>
            <div className={styles.status}>
              <span className={styles.liveDot} /> Connected
            </div>
            <button type="button" className={styles.declineBtn} onClick={onEnd}>
              End Call
            </button>
          </>
        )}

        {state === 'ended' && <div className={styles.status}>Call ended</div>}

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
