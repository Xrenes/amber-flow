import React, { useMemo, useState } from 'react';
import type { Profile, TimeSession } from '@amber-flow/shared';
import { accountFromProjectName, fmtHM } from '../../components/workedTime';
import styles from './AccountsAgentsPanel.module.css';

interface Props {
  profiles: Profile[];
  sessions: TimeSession[];
}

interface Selection {
  kind: 'account' | 'agent';
  key: string; // account name, or agent user_id
}

// Since one Account is worked by multiple Agents, Overview needs both as
// their own labeled lists (not folded into the per-agent cards below) —
// select an Account to see which agents worked it, or an Agent to see which
// accounts they worked, both by time tracked.
export default function AccountsAgentsPanel({ profiles, sessions }: Props) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const profileMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    profiles.forEach((p) => (map[p.id] = p));
    return map;
  }, [profiles]);

  // matrix[account][agentId] = seconds
  const { accountTotals, agentTotals, matrix } = useMemo(() => {
    const accountTotals: Record<string, number> = {};
    const agentTotals: Record<string, number> = {};
    const matrix: Record<string, Record<string, number>> = {};
    sessions.forEach((s) => {
      const sec = s.duration_seconds || 0;
      if (!sec) return;
      const account = accountFromProjectName(s.project_name);
      accountTotals[account] = (accountTotals[account] || 0) + sec;
      agentTotals[s.user_id] = (agentTotals[s.user_id] || 0) + sec;
      if (!matrix[account]) matrix[account] = {};
      matrix[account][s.user_id] = (matrix[account][s.user_id] || 0) + sec;
    });
    return { accountTotals, agentTotals, matrix };
  }, [sessions]);

  const accountList = useMemo(
    () => Object.entries(accountTotals).sort((a, b) => b[1] - a[1]),
    [accountTotals]
  );
  const agentList = useMemo(
    () =>
      Object.entries(agentTotals)
        .filter(([id]) => profileMap[id])
        .sort((a, b) => b[1] - a[1]),
    [agentTotals, profileMap]
  );

  // Cross-breakdown for whatever's selected.
  const crossBreakdown = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === 'account') {
      const perAgent = matrix[selected.key] || {};
      return Object.entries(perAgent)
        .map(([agentId, sec]) => ({ label: profileMap[agentId]?.name || 'Unknown', sec }))
        .sort((a, b) => b.sec - a.sec);
    }
    return Object.entries(matrix)
      .map(([account, perAgent]) => ({ label: account, sec: perAgent[selected.key] || 0 }))
      .filter((e) => e.sec > 0)
      .sort((a, b) => b.sec - a.sec);
  }, [selected, matrix, profileMap]);

  if (!accountList.length && !agentList.length) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.column}>
        <div className={styles.columnLabel}>Accounts</div>
        <div className={styles.list}>
          {accountList.map(([account, sec]) => {
            const isSelected = selected?.kind === 'account' && selected.key === account;
            return (
              <button
                key={account}
                type="button"
                className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                onClick={() => setSelected(isSelected ? null : { kind: 'account', key: account })}
              >
                <span className={styles.rowName}>{account}</span>
                <span className={styles.rowHours}>{fmtHM(sec)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.column}>
        <div className={styles.columnLabel}>Agents</div>
        <div className={styles.list}>
          {agentList.map(([agentId, sec]) => {
            const isSelected = selected?.kind === 'agent' && selected.key === agentId;
            return (
              <button
                key={agentId}
                type="button"
                className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                onClick={() => setSelected(isSelected ? null : { kind: 'agent', key: agentId })}
              >
                <span className={styles.rowName}>{profileMap[agentId]?.name || 'Unknown'}</span>
                <span className={styles.rowHours}>{fmtHM(sec)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && crossBreakdown && (
        <div className={styles.column}>
          <div className={styles.columnLabel}>
            {selected.kind === 'account' ? selected.key : profileMap[selected.key]?.name || 'Unknown'}
          </div>
          <div className={styles.list}>
            {crossBreakdown.length === 0 && <div className={styles.empty}>No time tracked yet.</div>}
            {crossBreakdown.map((e) => (
              <div key={e.label} className={styles.row}>
                <span className={styles.rowName}>{e.label}</span>
                <span className={styles.rowHours}>{fmtHM(e.sec)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
