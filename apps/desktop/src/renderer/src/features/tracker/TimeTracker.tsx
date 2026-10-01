import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildAgentOptions } from '@amber-flow/shared';
import { useAuth } from '../../auth/AuthContext';
import { useTimeTracker } from './useTimeTracker';
import { useTaskFieldOptions } from '../appointments/useTaskFieldOptions';
import { useTeamDirectory } from '../appointments/useTeamDirectory';
import SessionHistory from './SessionHistory';
import ManualEntryPanel from './ManualEntryPanel';
import Dropdown from '../../components/Dropdown';
import styles from './TimeTracker.module.css';

// Faithful port of the Time Tracker card from app.js / index.html
// (tracker-section / tracker-card markup, startTracker/stopTracker/
// resumeTracker/newTrackerSession state machine, daily goal + progress bar,
// and the collapsible session history list) — the free-text project field
// has since been replaced with Campaign/Account/Agent dropdowns, sharing the
// same admin-managed option pools as Appointments, and Resume re-confirms
// the same three fields (pre-filled, editable) before continuing.
export default function TimeTracker() {
  const { user } = useAuth();
  const tracker = useTimeTracker(user?.id);
  const campaignField = useTaskFieldOptions('campaign');
  const accountField = useTaskFieldOptions('account');
  const agentNameField = useTaskFieldOptions('agent');
  const { members: teamMembers } = useTeamDirectory();

  const [campaign, setCampaign] = useState('');
  const [account, setAccount] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [inputError, setInputError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the local fields in sync with the tracker's own state (restored on
  // mount, or reset by "New") whenever it's not actively running — so the
  // Resume prompt shows the paused session's values pre-filled.
  useEffect(() => {
    if (tracker.buttonState !== 'running') {
      setCampaign(tracker.campaign);
      setAccount(tracker.account);
      setAssignedUserId(tracker.assignedUserId || user?.id || '');
    }
  }, [tracker.buttonState, tracker.campaign, tracker.account, tracker.assignedUserId, user?.id]);

  const assigneeOptions = useMemo(() => {
    if (!user?.id) return teamMembers;
    if (teamMembers.some((m) => m.id === user.id)) return teamMembers;
    return [{ id: user.id, name: user.name }, ...teamMembers];
  }, [teamMembers, user]);

  // Triple-click on the tracker icon reveals the secret manual-entry panel
  // (mirrors app.js's iconClickCount / iconClickTimer logic).
  const iconClickCountRef = useRef(0);
  const iconClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleIconClick() {
    iconClickCountRef.current++;
    if (iconClickTimerRef.current) clearTimeout(iconClickTimerRef.current);
    if (iconClickCountRef.current >= 3) {
      iconClickCountRef.current = 0;
      setManualOpen(true);
    } else {
      iconClickTimerRef.current = setTimeout(() => {
        iconClickCountRef.current = 0;
      }, 600);
    }
  }

  function currentAssignment() {
    return { campaign, account, assignedUserId: assignedUserId || user?.id || '' };
  }

  function flashError() {
    setInputError(true);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setInputError(false), 1400);
  }

  function handleStart() {
    const ok = tracker.startTracker(currentAssignment());
    if (!ok) flashError();
  }

  function handleResume() {
    const ok = tracker.resumeTracker(currentAssignment());
    if (!ok) flashError();
  }

  function handleGoalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (v > 0 && v <= 24) tracker.setGoal(v);
  }

  function toggleHistory() {
    setHistoryOpen((v) => !v);
  }

  const fieldsDisabled = tracker.buttonState === 'running';

  return (
    <section className={styles.trackerSection}>
      <div className={styles.trackerCard}>
        <div className={styles.trackerHeader}>
          <div className={styles.trackerTitleRow}>
            <svg
              onClick={handleIconClick}
              viewBox="0 0 24 24"
              width="15"
              height="15"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ cursor: 'pointer', flex: '0 0 auto' }}
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Time Tracker
          </div>
          <div className={styles.trackerTimer}>{tracker.displayText}</div>
        </div>

        <div className={`${styles.trackerAssignRow} ${inputError ? styles.trackerInputError : ''}`}>
          <label className={styles.trackerAssignField}>
            <span>Campaign</span>
            {campaignField.mode === 'dropdown' ? (
              <Dropdown
                value={campaign}
                disabled={fieldsDisabled}
                onChange={setCampaign}
                options={[{ value: '', label: '— Select —' }, ...campaignField.options.map((opt) => ({ value: opt.value, label: opt.value }))]}
              />
            ) : (
              <input
                type="text"
                placeholder="e.g. Q3 Outreach"
                disabled={fieldsDisabled}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
              />
            )}
          </label>
          <label className={styles.trackerAssignField}>
            <span>Account</span>
            {accountField.mode === 'dropdown' ? (
              <Dropdown
                value={account}
                disabled={fieldsDisabled}
                onChange={setAccount}
                options={[{ value: '', label: '— Select —' }, ...accountField.options.map((opt) => ({ value: opt.value, label: opt.value }))]}
              />
            ) : (
              <input
                type="text"
                placeholder="e.g. Upwork - Client X"
                disabled={fieldsDisabled}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              />
            )}
          </label>
          <label className={styles.trackerAssignField}>
            <span>Agent</span>
            <Dropdown
              value={assignedUserId}
              disabled={fieldsDisabled}
              onChange={setAssignedUserId}
              options={buildAgentOptions(assigneeOptions, agentNameField.options.map((o) => o.value), user?.id)}
            />
          </label>
        </div>

        <div className={styles.trackerTop}>
          <div className={styles.trackerControls}>
            {tracker.buttonState === 'idle' && (
              <button className={styles.primaryBtn} onClick={handleStart}>
                ▶ Start
              </button>
            )}
            {tracker.buttonState === 'running' && (
              <>
                <button className={styles.ghostBtn} onClick={tracker.stopTracker}>
                  ⏹ Stop
                </button>
                <button
                  className={`${styles.breakBtn} ${tracker.onBreak ? styles.breakActive : ''}`}
                  onClick={tracker.toggleBreak}
                >
                  {tracker.onBreak ? '▶ End Break' : '⏸ Break'}
                </button>
              </>
            )}
            {tracker.buttonState === 'stopped' && (
              <>
                <button className={styles.ghostBtn} onClick={handleResume}>
                  ↻ Resume
                </button>
                <button className={styles.ghostBtn} onClick={tracker.newTrackerSession}>
                  + New
                </button>
              </>
            )}
          </div>
        </div>

        <div className={styles.trackerGoalRow}>
          <span className={styles.trackerGoalLabel}>Daily goal</span>
          <input
            type="number"
            className={styles.trackerGoalField}
            min={1}
            max={24}
            value={tracker.goal}
            onChange={handleGoalChange}
          />
          <span className={styles.trackerGoalUnit}>hrs</span>
          <div className={styles.trackerProgressWrap}>
            <div
              className={styles.trackerProgressBar}
              style={{ width: `${tracker.goalProgress.pct.toFixed(1)}%` }}
            />
          </div>
          <span className={styles.trackerProgressText}>{tracker.goalProgress.text}</span>
        </div>

        <button
          className={`${styles.trackerHistoryToggle} ${historyOpen ? styles.open : ''}`}
          onClick={toggleHistory}
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Session History
        </button>
        {historyOpen && (
          <div className={styles.trackerHistory}>
            <SessionHistory sessions={tracker.sessions} />
          </div>
        )}
      </div>

      {manualOpen && (
        <ManualEntryPanel tracker={tracker} onClose={() => setManualOpen(false)} />
      )}
    </section>
  );
}
