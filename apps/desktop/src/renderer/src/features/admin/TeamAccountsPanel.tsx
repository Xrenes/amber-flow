import React, { useState } from 'react';
import { adminResetPassword } from '@amber-flow/shared';
import type { Profile } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import styles from './TeamAccountsPanel.module.css';

interface Props {
  profiles: Profile[];
}

function ResetRow({ account, onDone }: { account: Profile; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    setError(null);
    const { error: err } = await adminResetPassword(account.id, password);
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  }

  return (
    <div className={styles.resetForm}>
      <input
        type="password"
        placeholder="New password (min 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={busy}>
        {busy ? 'Saving…' : 'Set password'}
      </button>
      <button type="button" className={styles.cancelBtn} onClick={onDone} disabled={busy}>
        Cancel
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

// Admin Panel → People → Team Accounts: every teammate with a login, each
// with a "Reset password" action for when someone forgets theirs. Managers
// can only reset agents' passwords (enforced server-side too).
export default function TeamAccountsPanel({ profiles }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [justReset, setJustReset] = useState<string | null>(null);

  const accounts = profiles.filter((p) => p.username).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (!accounts.length) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>Team accounts ({accounts.length})</div>
      {accounts.map((p) => {
        const canReset = isAdmin || p.role === 'agent';
        return (
          <div key={p.id} className={styles.row}>
            <div>
              <div className={styles.name}>{p.name || 'Unnamed'}</div>
              <div className={styles.username}>@{p.username}</div>
            </div>
            <span className={styles.roleBadge}>{p.role}</span>
            <div className={styles.spacer} />
            {resettingId === p.id ? (
              <ResetRow
                account={p}
                onDone={() => {
                  setResettingId(null);
                  setJustReset(p.id);
                }}
              />
            ) : justReset === p.id ? (
              <span className={styles.success}>Password updated</span>
            ) : canReset ? (
              <button type="button" className={styles.resetBtn} onClick={() => setResettingId(p.id)}>
                Reset password
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
