import React, { useEffect, useRef, useState } from 'react';
import {
  signInWithChatId,
  signUpWithChatId,
  normalizeChatId,
  chatIdToEmail,
  verifyMagicLinkOtp,
  sendOtp,
  verifyOtp,
  verifyInviteCode,
  internalLogin,
  verifyOtpForPasswordReset,
  resetPassword,
  getSupabase,
} from '@amber-flow/shared';
import styles from './LoginPage.module.css';
import logo from '../assets/logo.png';
import OtpBoxes from '../components/OtpBoxes';

type Section =
  | 'login'
  | 'register'
  | 'otp'
  | 'password'
  | 'team'
  | 'forgotPhone'
  | 'forgotOtp'
  | 'forgotNewPw';

type Tab = 'login' | 'register' | 'team';
type StatusType = 'error' | 'success' | 'info' | null;

export default function LoginPage() {
  const [section, setSection] = useState<Section>('login');
  const [tab, setTab] = useState<Tab>('login');
  const [status, setStatus] = useState<{ text: string; type: StatusType }>({ text: '', type: null });
  const [busy, setBusy] = useState(false);

  // Sign in
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regName, setRegName] = useState('');
  const [regChatId, setRegChatId] = useState('');
  const [regChatIdNormalized, setRegChatIdNormalized] = useState('');
  const [showInviteField, setShowInviteField] = useState(false);
  const [regInviteCode, setRegInviteCode] = useState('');
  const [setPassword, setSetPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(''));

  // Team login
  const [teamUsername, setTeamUsername] = useState('');
  const [teamPassword, setTeamPassword] = useState('');

  // Forgot password
  const [forgotChatId, setForgotChatId] = useState('');
  const [forgotOtpValues, setForgotOtpValues] = useState<string[]>(Array(6).fill(''));
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');

  const showMsg = (text: string, type: StatusType) => setStatus({ text, type });
  const clearMsg = () => setStatus({ text: '', type: null });

  function goTo(next: Section) {
    clearMsg();
    setSection(next);
  }

  function switchTab(next: Tab) {
    setTab(next);
    goTo(next === 'login' ? 'login' : next === 'register' ? 'register' : 'team');
  }

  const showTabs = section === 'login' || section === 'register' || section === 'team';

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!loginPhone) return showMsg('Please enter your Telegram Chat ID.', 'error');
    if (!loginPassword) return showMsg('Please enter your password.', 'error');
    setBusy(true);
    const { error } = await signInWithChatId(loginPhone, loginPassword);
    setBusy(false);
    if (error) {
      showMsg(
        error.message === 'Invalid login credentials'
          ? 'Incorrect Chat ID or password. Please try again.'
          : error.message,
        'error'
      );
    }
    // On success, AuthContext's onAuthStateChange picks up the new session
    // and App.tsx redirects away from /login automatically.
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim()) return showMsg('Please enter your name.', 'error');
    const normalized = normalizeChatId(regChatId.trim());
    if (normalized.length < 5) {
      return showMsg('Please enter a valid Telegram Chat ID (numbers only).', 'error');
    }
    setRegChatIdNormalized(normalized);
    setBusy(true);
    try {
      const data = await sendOtp(normalized);
      if (!data.ok) {
        showMsg(data.error || 'Failed to send OTP. Try again.', 'error');
      } else {
        setOtpValues(Array(6).fill(''));
        goTo('otp');
      }
    } catch {
      showMsg('Network error. Check your connection.', 'error');
    }
    setBusy(false);
  }

  async function handleResendOtp() {
    try {
      await sendOtp(regChatIdNormalized);
      showMsg('New code sent to your Telegram.', 'info');
    } catch {
      showMsg('Could not resend. Try again.', 'error');
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const otp = otpValues.join('');
    if (otp.length < 6) return showMsg('Please enter all 6 digits.', 'error');
    setBusy(true);
    try {
      const data = await verifyOtp(regChatIdNormalized, otp);
      if (!data.ok) {
        showMsg(data.error || 'Invalid code. Please try again.', 'error');
      } else {
        goTo('password');
      }
    } catch {
      showMsg('Network error. Check your connection.', 'error');
    }
    setBusy(false);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!setPassword || setPassword.length < 8) return showMsg('Password must be at least 8 characters.', 'error');
    if (setPassword !== confirmPassword) return showMsg('Passwords do not match.', 'error');
    setBusy(true);

    const { data, error } = await signUpWithChatId(regChatIdNormalized, setPassword, regName);
    if (error) {
      showMsg(error.message, 'error');
      setBusy(false);
      return;
    }

    const inviteCode = regInviteCode.trim();
    if (inviteCode && data.user?.id) {
      try {
        await verifyInviteCode(inviteCode, data.user.id);
        // Silent rejection on wrong code — no hint given to attacker.
      } catch {
        /* noop — role stays 'agent' if Worker unreachable */
      }
    }

    if (!data.session) {
      showMsg('Account created! Signing you in…', 'success');
      const { error: signInErr } = await signInWithChatId(regChatIdNormalized, setPassword);
      if (signInErr) {
        setTimeout(() => switchTab('login'), 1500);
      }
    }
    setBusy(false);
  }

  async function handleTeamLogin(e: React.FormEvent) {
    e.preventDefault();
    const username = teamUsername.trim().toLowerCase();
    if (!username || !teamPassword) return showMsg('Please enter your name and password.', 'error');
    setBusy(true);
    try {
      const data = await internalLogin(username, teamPassword);
      if (!data.ok || !data.email || !data.token) {
        showMsg(data.error || 'Invalid credentials.', 'error');
        setBusy(false);
        return;
      }
      const { error } = await verifyMagicLinkOtp(data.email, data.token);
      if (error) {
        showMsg('Sign in failed. Try again.', 'error');
        setBusy(false);
      }
    } catch {
      showMsg('Network error.', 'error');
      setBusy(false);
    }
  }

  async function handleSendResetCode(e: React.FormEvent) {
    e.preventDefault();
    const chatId = normalizeChatId(forgotChatId.trim());
    if (chatId.length < 5) return showMsg('Enter a valid Telegram Chat ID.', 'error');
    setForgotChatId(chatId);
    setBusy(true);
    try {
      const data = await sendOtp(chatId);
      if (!data.ok) {
        showMsg(data.error || 'Failed to send code.', 'error');
      } else {
        setForgotOtpValues(Array(6).fill(''));
        goTo('forgotOtp');
      }
    } catch {
      showMsg('Network error.', 'error');
    }
    setBusy(false);
  }

  async function handleResendResetCode() {
    try {
      await sendOtp(forgotChatId);
      showMsg('New code sent.', 'info');
    } catch {
      showMsg('Could not resend.', 'error');
    }
  }

  async function handleVerifyResetOtp(e: React.FormEvent) {
    e.preventDefault();
    const otp = forgotOtpValues.join('');
    if (otp.length < 6) return showMsg('Enter all 6 digits.', 'error');
    setBusy(true);
    try {
      const data = await verifyOtpForPasswordReset(forgotChatId, otp);
      if (!data.ok) {
        showMsg(data.error || 'Invalid code.', 'error');
      } else {
        setNewPw('');
        setConfirmNewPw('');
        goTo('forgotNewPw');
      }
    } catch {
      showMsg('Network error.', 'error');
    }
    setBusy(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPw || newPw.length < 8) return showMsg('Password must be at least 8 characters.', 'error');
    if (newPw !== confirmNewPw) return showMsg('Passwords do not match.', 'error');
    setBusy(true);
    try {
      const data = await resetPassword(forgotChatId, newPw);
      if (!data.ok) {
        showMsg(data.error || 'Failed to reset password.', 'error');
        setBusy(false);
        return;
      }
      const { error } = await signInWithChatId(forgotChatId, newPw);
      if (error) {
        showMsg('Password reset. Please sign in.', 'success');
        setTimeout(() => switchTab('login'), 1500);
      }
    } catch {
      showMsg('Network error.', 'error');
    }
    setBusy(false);
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

        {showTabs && (
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'login' ? styles.active : ''}`}
              onClick={() => switchTab('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'register' ? styles.active : ''}`}
              onClick={() => switchTab('register')}
            >
              Create Account
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'team' ? styles.active : ''}`}
              onClick={() => switchTab('team')}
            >
              Team
            </button>
          </div>
        )}

        {status.type && <div className={`${styles.status} ${styles[status.type]}`}>{status.text}</div>}

        {section === 'login' && (
          <form onSubmit={handleSignIn}>
            <div className={styles.sectionHeading}>Sign in</div>
            <div className={styles.sectionSub}>
              New user?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  switchTab('register');
                }}
              >
                Create an account
              </a>
            </div>
            <div className={styles.field}>
              <span>Telegram Chat ID</span>
              <input
                type="text"
                placeholder="e.g. 123456789"
                autoComplete="off"
                inputMode="numeric"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>Password</span>
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Sign In
            </button>
            <div className={styles.helpLinks} style={{ marginTop: 18 }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setTab('login');
                  goTo('forgotPhone');
                }}
              >
                Forgot password?
              </a>
            </div>
          </form>
        )}

        {section === 'register' && (
          <form onSubmit={handleSendOtp}>
            <div className={styles.sectionHeading}>Create account</div>
            <div className={styles.sectionSub}>
              Already have one?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  switchTab('login');
                }}
              >
                Sign in
              </a>
            </div>
            <div className={styles.field}>
              <span>Your name</span>
              <input
                type="text"
                placeholder="e.g. Alex"
                maxLength={40}
                autoComplete="name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>Telegram Chat ID</span>
              <input
                type="text"
                placeholder="e.g. 123456789"
                autoComplete="off"
                inputMode="numeric"
                value={regChatId}
                onChange={(e) => setRegChatId(e.target.value)}
              />
              <small className={styles.hint}>
                Open <strong>@AmberFlowBot</strong> in Telegram → send <code>/start</code> → it replies with your
                Chat ID
              </small>
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Continue →
            </button>

            <div style={{ marginTop: 18, textAlign: 'center' }}>
              <a
                href="#"
                style={{
                  fontSize: 12,
                  color: 'rgba(240,240,248,0.4)',
                  textDecoration: 'none',
                  borderBottom: '1px dashed rgba(240,240,248,0.2)',
                  paddingBottom: 1,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  setShowInviteField((v) => !v);
                }}
              >
                Have an admin invite code?
              </a>
            </div>
            {showInviteField && (
              <div style={{ marginTop: 12 }}>
                <div className={styles.field}>
                  <span>Invite code</span>
                  <input
                    type="password"
                    placeholder="Enter invite code"
                    autoComplete="off"
                    value={regInviteCode}
                    onChange={(e) => setRegInviteCode(e.target.value)}
                  />
                </div>
              </div>
            )}
          </form>
        )}

        {section === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <a
              className={styles.backLink}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goTo('register');
              }}
            >
              ← Change Chat ID
            </a>
            <div className={styles.sectionHeading}>Enter code</div>
            <div className={styles.sectionSub}>
              We sent a 6-digit code to your Telegram (Chat ID: {regChatIdNormalized}).
            </div>
            <OtpBoxes values={otpValues} onChange={setOtpValues} onComplete={() => {}} />
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Verify Code
            </button>
            <div className={styles.otpSubLinks}>
              <a
                onClick={(e) => {
                  e.preventDefault();
                  handleResendOtp();
                }}
              >
                Resend code
              </a>
            </div>
          </form>
        )}

        {section === 'password' && (
          <form onSubmit={handleCreateAccount}>
            <div className={styles.sectionHeading}>Set password</div>
            <div className={styles.sectionSub}>Almost there — choose a secure password.</div>
            <div className={styles.field}>
              <span>Password</span>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                value={setPassword}
                onChange={(e) => setSetPassword(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>Confirm password</span>
              <input
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Create Account
            </button>
          </form>
        )}

        {section === 'team' && (
          <form onSubmit={handleTeamLogin}>
            <div className={styles.sectionHeading}>Team Access</div>
            <div className={styles.sectionSub}>Enter your name and password to sign in.</div>
            <div className={styles.field}>
              <span>Name</span>
              <input
                type="text"
                placeholder="e.g. Sam"
                autoComplete="off"
                spellCheck={false}
                value={teamUsername}
                onChange={(e) => setTeamUsername(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>Password</span>
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={teamPassword}
                onChange={(e) => setTeamPassword(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Sign In as Team Member
            </button>
            <div className={styles.helpLinks} style={{ marginTop: 18 }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  goTo('forgotPhone');
                }}
              >
                Forgot password?
              </a>
            </div>
          </form>
        )}

        {section === 'forgotPhone' && (
          <form onSubmit={handleSendResetCode}>
            <a
              className={styles.backLink}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                switchTab('login');
              }}
            >
              ← Back to Sign In
            </a>
            <div className={styles.sectionHeading}>Reset Password</div>
            <div className={styles.sectionSub}>Enter your Telegram Chat ID. We'll send a 6-digit reset code.</div>
            <div className={styles.field}>
              <span>Telegram Chat ID</span>
              <input
                type="text"
                placeholder="e.g. 123456789"
                autoComplete="off"
                inputMode="numeric"
                value={forgotChatId}
                onChange={(e) => setForgotChatId(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Send Reset Code via Telegram
            </button>
          </form>
        )}

        {section === 'forgotOtp' && (
          <form onSubmit={handleVerifyResetOtp}>
            <a
              className={styles.backLink}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                goTo('forgotPhone');
              }}
            >
              ← Change Chat ID
            </a>
            <div className={styles.sectionHeading}>Enter Code</div>
            <div className={styles.sectionSub}>We sent a 6-digit code to your Telegram (Chat ID: {forgotChatId}).</div>
            <OtpBoxes values={forgotOtpValues} onChange={setForgotOtpValues} onComplete={() => {}} />
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Verify Code
            </button>
            <div className={styles.otpSubLinks}>
              <a
                onClick={(e) => {
                  e.preventDefault();
                  handleResendResetCode();
                }}
              >
                Resend code
              </a>
            </div>
          </form>
        )}

        {section === 'forgotNewPw' && (
          <form onSubmit={handleResetPassword}>
            <div className={styles.sectionHeading}>New Password</div>
            <div className={styles.sectionSub}>Choose a strong new password for your account.</div>
            <div className={styles.field}>
              <span>New Password</span>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span>Confirm Password</span>
              <input
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                value={confirmNewPw}
                onChange={(e) => setConfirmNewPw(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.ctaBtn} disabled={busy}>
              Reset Password
            </button>
          </form>
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
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d="M22 2L15 22l-4-9-9-4 20-7z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              Telegram Alerts
            </div>
          </div>
        </div>
        <div className={styles.leftFooter}>AMBER FLOW · YOUR WORK IN FLOW</div>
      </div>
    </div>
  );
}
