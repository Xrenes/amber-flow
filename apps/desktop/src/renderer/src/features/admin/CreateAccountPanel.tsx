import React, { useState } from 'react';
import { adminCreateAccount } from '@amber-flow/shared';
import type { Role } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import Dropdown from '../../components/Dropdown';
import styles from './CreateAccountPanel.module.css';

interface Props {
  onCreated: () => void;
}

// Admin Panel → People → Team Accounts: lets an admin/manager make a login
// for someone directly — no "Request Account" step required first. Goes
// through the admin-create-user Edge Function, the only place with the
// service-role key needed to create a Supabase Auth user.
export default function CreateAccountPanel({ onCreated }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) return setError('Enter the person’s name.');
    if (!/^[a-z0-9._-]{2,32}$/.test(username.trim().toLowerCase())) {
      return setError('Username must be 2–32 characters: letters, numbers, dot, dash or underscore.');
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    const { data, error: err } = await adminCreateAccount({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      password,
      role,
    });
    setBusy(false);
    if (err || !data) {
      setError(err?.message || 'Could not create the account.');
      return;
    }
    setSuccess(`Created “${data.user.name}” (${data.user.username}) as ${data.user.role}.`);
    setName('');
    setUsername('');
    setPassword('');
    setRole('agent');
    onCreated();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>Create account</div>
      <p className={styles.hint}>
        Set up a login for someone right away — they can sign in with this username and password immediately.
      </p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="ca-name">Name</label>
          <input id="ca-name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={80} />
        </div>
        <div className={styles.field}>
          <label htmlFor="ca-username">Username</label>
          <input
            id="ca-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            maxLength={32}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="ca-password">Password</label>
          <input
            id="ca-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder="Min 8 characters"
          />
        </div>

        <div className={styles.roleRow}>
          <label>Role</label>
          <Dropdown
            value={role}
            onChange={(v) => setRole(v as Role)}
            disabled={busy || !isAdmin}
            options={[
              { value: 'agent', label: 'Agent' },
              { value: 'manager', label: 'Manager' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
          {!isAdmin && <span className={styles.hint}>Managers can only create agent accounts.</span>}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.submitBtn} disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          {error && <span className={styles.error}>{error}</span>}
          {success && <span className={styles.success}>{success}</span>}
        </div>
      </form>
    </div>
  );
}
