import React, { useState } from 'react';
import { adminResetPassword, adminUpdateAccount, adminDeleteAccount } from '@amber-flow/shared';
import type { Profile, Role } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import Dropdown from '../../components/Dropdown';
import styles from './TeamAccountsPanel.module.css';

interface Props {
  profiles: Profile[];
  onChanged: () => void;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

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

// Edit name / username / role in one form. Role only shows (and is only
// saveable) for an admin editing someone else — a manager can rename/re-
// username an agent but never touch roles (server enforces this too).
function EditRow({
  account,
  canChangeRole,
  onDone,
  onCancel,
}: {
  account: Profile;
  canChangeRole: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.name || '');
  const [username, setUsername] = useState(account.username || '');
  const [role, setRole] = useState<Role>(account.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return setError('Name can’t be empty.');
    if (!/^[a-z0-9._-]{2,32}$/i.test(username.trim())) {
      return setError('Username must be 2–32 characters: letters, numbers, dot, dash or underscore.');
    }
    setBusy(true);
    setError(null);
    const { error: err } = await adminUpdateAccount({
      userId: account.id,
      name: name.trim(),
      username: username.trim().toLowerCase(),
      ...(canChangeRole && role !== account.role ? { role } : {}),
    });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  }

  return (
    <div className={styles.editForm}>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={busy}
      />
      {canChangeRole && (
        <Dropdown value={role} onChange={(v) => setRole(v as Role)} options={ROLE_OPTIONS} disabled={busy} />
      )}
      <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

// Admin Panel → Team Accounts (also reachable from Settings): every login,
// with full control — rename, change username, change role (admin only),
// reset password, activate/deactivate, delete. Managers can only edit/
// reset/delete agents and never see role controls (enforced server-side
// too). Deleting keeps the person's appointments and tracked time (handed
// to the admin, agent name kept) — see the admin-delete-user Edge Function.
export default function TeamAccountsPanel({ profiles, onChanged }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [justReset, setJustReset] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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

  async function toggleStatus(p: Profile) {
    setStatusBusyId(p.id);
    setStatusError(null);
    const nextStatus = p.status === 'inactive' ? 'active' : 'inactive';
    const { error } = await adminUpdateAccount({ userId: p.id, status: nextStatus });
    setStatusBusyId(null);
    if (error) {
      setStatusError(error.message);
      return;
    }
    onChanged();
  }

  if (!accounts.length) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>Team accounts ({accounts.length})</div>
      {deleteError && <p className={styles.error}>{deleteError}</p>}
      {statusError && <p className={styles.error}>{statusError}</p>}
      {accounts.map((p) => {
        const canEdit = isAdmin || p.role === 'agent';
        const canDelete = canEdit && p.id !== user?.id;
        const canToggleStatus = canEdit && p.id !== user?.id;
        const inactive = p.status === 'inactive';
        const editing = editingId === p.id;
        const resetting = resettingId === p.id;

        return (
          <div key={p.id} className={`${styles.row} ${inactive ? styles.rowInactive : ''}`}>
            {editing ? (
              <EditRow
                account={p}
                canChangeRole={isAdmin}
                onDone={() => {
                  setEditingId(null);
                  onChanged();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : resetting ? (
              <ResetRow
                account={p}
                onDone={() => {
                  setResettingId(null);
                  setJustReset(p.id);
                }}
              />
            ) : (
              <>
                <div>
                  <div className={styles.name}>
                    {p.name || 'Unnamed'}
                    {inactive && <span className={styles.inactiveTag}>Deactivated</span>}
                  </div>
                  <div className={styles.username}>{p.username ? `@${p.username}` : 'No username'}</div>
                </div>
                <span className={styles.roleBadge}>{p.role}</span>
                <div className={styles.spacer} />
                {justReset === p.id && <span className={styles.success}>Password updated</span>}
                {canEdit && (
                  <>
                    <button type="button" className={styles.resetBtn} onClick={() => setEditingId(p.id)}>
                      Edit
                    </button>
                    <button type="button" className={styles.resetBtn} onClick={() => setResettingId(p.id)}>
                      Reset password
                    </button>
                    {canToggleStatus && (
                      <button
                        type="button"
                        className={styles.resetBtn}
                        onClick={() => toggleStatus(p)}
                        disabled={statusBusyId === p.id}
                      >
                        {statusBusyId === p.id ? 'Saving…' : inactive ? 'Activate' : 'Deactivate'}
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className={styles.deleteBtn} onClick={() => setDeleting(p)} disabled={deleteBusy}>
                        Delete
                      </button>
                    )}
                  </>
                )}
              </>
            )}
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
