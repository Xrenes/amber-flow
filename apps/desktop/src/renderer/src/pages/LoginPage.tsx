import React, { useState } from 'react';
import { signInWithUsername, submitAccountRequest } from '@amber-flow/shared';
import styles from './LoginPage.module.css';
import logo from '../assets/logo.png';

type Section = 'login' | 'request' | 'requestSent';
type StatusType = 'error' | 'success' | 'info' | null;

// Simplified auth: username + password sign in, and an admin-reviewed
// "Request Account" form in place of self-service Telegram-OTP registration.
export default function LoginPage() {
  const [section, setSection] = useState<Section>('login');
  const [status, setStatus] = useState<{ text: string; type: StatusType }>({ text: '', type: null });
  const [busy, setBusy] = useState(false);

  // Sign in
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Request account
  const [reqName, setReqName] = useState('');
  const [reqContact, setReqContact] = useState('');
  const [reqNote, setReqNote] = useState('');

  const showMsg = (text: string, type: StatusType) => setStatus({ text, type });
  const clearMsg = () => setStatus({ text: '', type: null });

  function goTo(next: Section) {
    clearMsg();
    setSection(next);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return showMsg('Please enter your username.', 'error');
    if (!password) return showMsg('Please enter your password.', 'error');
    setBusy(true);
    const { error } = await signInWithUsername(username.trim(), password);
    setBusy(false);
    if (error) {
      showMsg(error.message || 'Incorrect username or password.', 'error');
    }
    // On success, AuthContext's onAuthStateChange picks up the new session
    // and App.tsx redirects away from /login automatically.
  }

  async function handleRequestAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!reqName.trim()) return showMsg('Please enter your name.', 'error');
    if (!reqContact.trim()) return showMsg('Please enter a way to reach you.', 'error');
    setBusy(true);
    const { error } = await submitAccountRequest(reqName, reqContact, reqNote);
    setBusy(false);
    if (error) {
      showMsg(error.message || 'Could not submit request. Try again.', 'error');
      return;
    }
    setReqName('');
    setReqContact('');
    setReqNote('');
    goTo('requestSent');
  }

  return (
    <div className={styles.page}>
      <div className={styles.panelRight}>
        <div className={styles.mobileBrand}>
          <div className={styles.mobileLogoMark}>
            <img src={logo} alt="Amber Flow" width={32} height={32} style={{ objectFit: 'contain' }} />
          </div>
          <div className={styles.mobileBrandName}>Amber Flow</div>
        </div>

        {status.type && <div className={`${styles.status} ${styles[status.type]}`}>{status.text}</div>}

        {section === 'login' && (
          <form onSubmit={handleSignIn}>
            <div className={styles.sectionHeading}>Sign in</div>
            <div className={styles.sectionSub}>
              Don't have an account?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  goTo('request');
                }}
              >
                Request one
              </a>
            </div>
            <div className={styles.field}>
              <span>Username</span>
              <input
                type="text"
                placeholder="e.g. jsmith"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>Password</span>
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Sign In
            </button>
          </form>
        )}

        {section === 'request' && (
          <form onSubmit={handleRequestAccount}>
            <a
              className={styles.backLink}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goTo('login');
              }}
            >
              ← Back to Sign In
            </a>
            <div className={styles.sectionHeading}>Request an account</div>
            <div className={styles.sectionSub}>
              An admin will review your request and set up your login.
            </div>
            <div className={styles.field}>
              <span>Your name</span>
              <input
                type="text"
                placeholder="e.g. Alex Smith"
                maxLength={80}
                autoComplete="name"
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>How can we reach you?</span>
              <input
                type="text"
                placeholder="Email or phone number"
                autoComplete="off"
                value={reqContact}
                onChange={(e) => setReqContact(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>
                Note <em>(optional)</em>
              </span>
              <input
                type="text"
                placeholder="Anything the admin should know"
                autoComplete="off"
                value={reqNote}
                onChange={(e) => setReqNote(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Send Request
            </button>
          </form>
        )}

        {section === 'requestSent' && (
          <div>
            <div className={styles.sectionHeading}>Request sent</div>
            <div className={styles.sectionSub}>
              An admin will review your request and reach out with your login details.
            </div>
            <button
              type="button"
              className={styles.ctaBtn}
              onClick={() => goTo('login')}
            >
              Back to Sign In
            </button>
          </div>
        )}
      </div>

      <div className={styles.panelLeft}>
        <div className={styles.panelLeftContent}>
          <div className={styles.logoMark}>
            <img src={logo} alt="Amber Flow" />
          </div>
          <div className={styles.brandName}>Amber Flow</div>
          <div className={styles.brandTagline}>
            Tasks, time tracking &amp; reminders —<br />
            everything your workday needs.
          </div>
          <div className={styles.featurePills}>
            <div className={styles.fpill}>
              <div className={styles.fpillIcon}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" />
                  <path d="M8 5v3l2 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              Time Tracker
            </div>
            <div className={styles.fpill}>
              <div className={styles.fpillIcon}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              Task Manager
            </div>
            <div className={styles.fpill}>
              <div className={styles.fpillIcon}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" />
                  <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              World Clocks
            </div>
            <div className={styles.fpill}>
              <div className={styles.fpillIcon}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8h8M4 5h8M4 11h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              Appointments
            </div>
          </div>
        </div>
        <div className={styles.leftFooter}>AMBER FLOW · YOUR WORK IN FLOW</div>
      </div>
    </div>
  );
}
