import React, { useState } from 'react';
import { adminResetPassword, adminDeleteAccount } from '@amber-flow/shared';
import type { Profile } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import styles from './TeamAccountsPanel.module.css';

interface Props {
  profiles: Profile[];
  onChanged: () => void;
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

// Admin Panel → People → Team Accounts: every login, each with "Reset
// password" and "Delete". Managers can only reset/delete agents (enforced
// server-side too); nobody can delete their own account. Deleting keeps the
// person's appointments and tracked time (handed to the admin, agent name
// kept) — see the admin-delete-user Edge Function.
export default function TeamAccountsPanel({ profiles, onChanged }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [justReset, setJustReset] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const accounts = [...profiles].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error } = await adminDeleteAccount(deleting.id);
    setDeleteBusy(false);
    if (error) {
      setDeleteError(error.message);
      setDeleting(null);
      return;
    }
    setDeleting(null);
    onChanged();
  }

  if (!accounts.length) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>Team accounts ({accounts.length})</div>
      {deleteError && <p className={styles.error}>{deleteError}</p>}
      {accounts.map((p) => {
        const canReset = isAdmin || p.role === 'agent';
        const canDelete = canReset && p.id !== user?.id;
        return (
          <div key={p.id} className={styles.row}>
            <div>
              <div className={styles.name}>{p.name || 'Unnamed'}</div>
              <div className={styles.username}>{p.username ? `@${p.username}` : 'No username'}</div>
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
              <>
                <button type="button" className={styles.resetBtn} onClick={() => setResettingId(p.id)}>
                  Reset password
                </button>
                {canDelete && (
                  <button type="button" className={styles.deleteBtn} onClick={() => setDeleting(p)} disabled={deleteBusy}>
                    Delete
                  </button>
                )}
              </>
            ) : null}
          </div>
        );
      })}

      {deleting && (
        <ConfirmDialog
          title="Delete account"
          message={`Delete ${deleting.name || 'this account'}'s login? They won't be able to sign in anymore. Their appointments and tracked time are kept (moved to you, labelled with their name).`}
          confirmLabel={deleteBusy ? 'Deleting…' : 'Delete'}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
