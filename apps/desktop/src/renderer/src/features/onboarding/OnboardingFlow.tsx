import React, { useEffect, useState } from 'react';
import { sendTelegramMessage, registerBotUser } from '@amber-flow/shared';
import styles from './OnboardingFlow.module.css';

// Ports showOnboardStep/closeOnboarding/openOnboarding + the two-step
// welcome/connect-Telegram flow from app.js, using the same localStorage
// flag ('amber.onboarded.v1') to show only once.
const ONBOARD_KEY = 'amber.onboarded.v1';

export function hasSeenOnboarding(): boolean {
  return !!localStorage.getItem(ONBOARD_KEY);
}

function markOnboarded() {
  localStorage.setItem(ONBOARD_KEY, '1');
}

interface OnboardingFlowProps {
  userId?: string;
  isTGConnected: boolean;
  onFinish: (tg: { chatId: string; name: string } | null) => void;
}

type StatusType = 'success' | 'error' | 'info' | null;

// Shown only when `!hasSeenOnboarding() && !isTGConnected` — mirrors app.js's
// gate: `if (!localStorage.getItem(ONBOARD_KEY) && !isTGConnected())`.
export default function OnboardingFlow({ userId, isTGConnected, onFinish }: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [chatId, setChatId] = useState('');
  const [status, setStatus] = useState<{ text: string; type: StatusType }>({ text: '', type: null });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleSkip();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSkip() {
    markOnboarded();
    onFinish(null);
  }

  async function handleTestSend() {
    const cleanChatId = chatId.trim().replace(/\D/g, '');
    if (!cleanChatId) {
      setStatus({ text: 'Enter your Telegram Chat ID first.', type: 'error' });
      return;
    }
    setStatus({ text: 'Sending test message...', type: 'info' });
    const greeting = name ? `Hi ${name}!` : 'Hi!';
    const msg = `${greeting} Amber Flow is connected. You will receive task reminders here.`;
    try {
      const data = await sendTelegramMessage(cleanChatId, msg);
      if (data.ok) {
        setStatus({ text: 'Test sent! Check Telegram.', type: 'success' });
      } else {
        setStatus({ text: data.error || 'Failed. Check your Chat ID.', type: 'error' });
      }
    } catch {
      setStatus({ text: 'Network error.', type: 'error' });
    }
  }

  async function handleFinish() {
    const cleanChatId = chatId.trim().replace(/\D/g, '');
    if (!cleanChatId) {
      setStatus({ text: 'Telegram Chat ID is required.', type: 'error' });
      return;
    }
    try {
      if (userId) await registerBotUser(cleanChatId, userId);
    } catch {
      /* non-critical */
    }
    markOnboarded();
    onFinish({ chatId: cleanChatId, name: name.trim() });
  }

  if (hasSeenOnboarding() || isTGConnected) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {step === 1 && (
          <div className={styles.onboardStep}>
            <div className={styles.onboardLogo}>
              <div className={styles.logoMark}>A</div>
            </div>
            <h2>Welcome to Amber</h2>
            <p className={styles.onboardSub}>
              Your personal task &amp; alarm manager.
              <br />
              Set up Telegram alerts so you never miss a follow-up.
            </p>
            <div className={styles.onboardFeatures}>
              {[
                'In-browser alarm with sound',
                'Telegram message when alarm fires',
                'Lead status tagging (S / NS / C)',
                'Live world clocks',
              ].map((f) => (
                <div key={f} className={styles.onboardFeature}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="#4ade80" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <button type="button" className={styles.fullBtn} onClick={() => setStep(2)}>
              Get Started &rarr;
            </button>
            <button type="button" className={styles.onboardSkip} onClick={handleSkip}>
              Skip — I'll configure later
            </button>
          </div>
        )}

        {step === 2 && (
          <div className={styles.onboardStep}>
            <div className={styles.onboardStepNum}>Step 1 of 1</div>
            <h2>Connect Telegram</h2>
            <p className={styles.onboardSub}>Takes 30 seconds — do this once from your phone.</p>
            <div className={styles.onboardInstructions}>
              <div className={styles.onboardInstRow}>
                <span className={styles.instNum}>1</span>
                <span>
                  Open Telegram and search for <strong>@AmberFlowBot</strong>
                </span>
              </div>
              <div className={styles.onboardInstRow}>
                <span className={styles.instNum}>2</span>
                <span>
                  Send <code className={styles.onboardCode}>/start</code> — the bot will reply with your <strong>Chat ID</strong>
                </span>
              </div>
              <div className={styles.onboardInstRow}>
                <span className={styles.instNum}>3</span>
                <span>
                  Paste it below and click <strong>Finish</strong>
                </span>
              </div>
            </div>
            {status.type && <div className={`${styles.statusBar} ${styles[status.type]}`}>{status.text}</div>}
            <label className={styles.field}>
              <span>Your name</span>
              <input type="text" placeholder="e.g. Alex" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>
                Telegram Chat ID <em>(from the bot reply)</em>
              </span>
              <input
                type="text"
                placeholder="e.g. 123456789"
                inputMode="numeric"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
            </label>
            <div className={styles.onboardActions}>
              <button type="button" className={styles.ghostBtn} onClick={handleTestSend}>
                Send test
              </button>
              <button type="button" className={styles.primaryBtn} onClick={handleFinish}>
                Finish &amp; Start
              </button>
            </div>
            <button type="button" className={styles.onboardSkip} onClick={() => setStep(1)}>
              &larr; Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
