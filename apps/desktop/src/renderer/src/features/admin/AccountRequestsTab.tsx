import React, { useEffect, useState } from 'react';
import { listAccountRequests, approveAccountRequest, rejectAccountRequest } from '@amber-flow/shared';
import type { AccountRequest, Role } from '@amber-flow/shared';
import { isDemoMode, demoAccountRequests } from '../../demo/demoData';
import type { Profile } from '@amber-flow/shared';
import CreateAccountPanel from './CreateAccountPanel';
import TeamAccountsPanel from './TeamAccountsPanel';
import Dropdown from '../../components/Dropdown';
import sharedStyles from './AdminShared.module.css';
import styles from './AccountRequestsTab.module.css';

function ApproveForm({ request, onDone }: { request: AccountRequest; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 8) {
      setError('Username required and password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await approveAccountRequest(request.id, username.trim(), password, request.name, role);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Failed to approve.');
      return;
    }
    onDone();
  }

  return (
    <form className={styles.approveForm} onSubmit={handleApprove}>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={busy}
      />
      <input
        type="password"
        placeholder="Set password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />
      <Dropdown
        value={role}
        onChange={(v) => setRole(v as Role)}
        disabled={busy}
        options={[
          { value: 'agent', label: 'Agent' },
          { value: 'manager', label: 'Manager' },
          { value: 'admin', label: 'Admin' },
        ]}
      />
      <button type="submit" className={styles.approveBtn} disabled={busy}>
        {busy ? 'Creating…' : 'Approve'}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}

// Admin-only tab: review pending account requests submitted from the login
// screen's "Request Account" form, approve (creates the real login) or reject.
export default function AccountRequestsTab({ profiles, onProfilesChanged }: { profiles: Profile[]; onProfilesChanged: () => void }) {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    if (isDemoMode()) {
      setRequests((prev) => (prev.length ? prev : demoAccountRequests));
      setLoading(false);
      return;
    }
    const { data } = await listAccountRequests();
    if (data) setRequests(data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleReject(id: string) {
    await rejectAccountRequest(id);
    refresh();
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      <CreateAccountPanel onCreated={onProfilesChanged} />
      <TeamAccountsPanel profiles={profiles} onChanged={onProfilesChanged} />
      {/* Accounts are now created above. Older login-screen requests, if any,
          still show here to approve or reject. */}
      {(loading || requests.length > 0) && (
        <>
      <h3 className={styles.sectionHeading}>Pending ({pending.length})</h3>
      {loading ? (
        <p className={sharedStyles.feedPlaceholder}>Loading…</p>
      ) : pending.length === 0 ? (
        <p className={sharedStyles.feedPlaceholder}>No pending requests.</p>
      ) : (
        <ul className={styles.list}>
          {pending.map((r) => (
            <li key={r.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemName}>{r.name}</div>
                <div className={styles.itemContact}>{r.contact}</div>
                {r.note && <div className={styles.itemNote}>{r.note}</div>}
              </div>
              {approvingId === r.id ? (
                <ApproveForm request={r} onDone={() => { setApprovingId(null); refresh(); }} />
              ) : (
                <div className={styles.itemActions}>
                  <button type="button" className={styles.approveBtn} onClick={() => setApprovingId(r.id)}>
                    Approve
                  </button>
                  <button type="button" className={styles.rejectBtn} onClick={() => handleReject(r.id)}>
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {reviewed.length > 0 && (
        <>
          <h3 className={styles.sectionHeading}>Reviewed</h3>
          <ul className={styles.list}>
            {reviewed.map((r) => (
              <li key={r.id} className={`${styles.item} ${styles.itemReviewed}`}>
                <div className={styles.itemMain}>
                  <div className={styles.itemName}>{r.name}</div>
                  <div className={styles.itemContact}>{r.contact}</div>
                </div>
                <span className={`${styles.statusBadge} ${styles[r.status]}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
        </>
      )}
    </div>
  );
}
