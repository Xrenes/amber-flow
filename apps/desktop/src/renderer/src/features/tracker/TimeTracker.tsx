import React, { useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useTimeTracker } from './useTimeTracker';
import SessionHistory from './SessionHistory';
import ManualEntryPanel from './ManualEntryPanel';
import styles from './TimeTracker.module.css';

// Faithful port of the Time Tracker card from app.js / index.html
// (tracker-section / tracker-card markup, startTracker/stopTracker/
// resumeTracker/newTrackerSession state machine, daily goal + progress bar,
// and the collapsible session history list).
export default function TimeTracker() {
  const { user } = useAuth();
  const tracker = useTimeTracker(user?.id);

  const [projectInput, setProjectInput] = useState('');
  const [inputError, setInputError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the local input in sync when a project is restored/loaded (live
  // restore on mount, or "New" resetting it) without fighting user typing
  // while the field is enabled.
  React.useEffect(() => {
    setProjectInput(tracker.project);
  }, [tracker.project]);

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

  function handleStart() {
    const ok = tracker.startTracker(projectInput);
    if (!ok) {
      setInputError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setInputError(false), 1400);
      return;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleStart();
  }

  function handleGoalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (v > 0 && v <= 24) tracker.setGoal(v);
  }

  function toggleHistory() {
    setHistoryOpen((v) => !v);
  }

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

        <div className={styles.trackerTop}>
          <input
            type="text"
            className={`${styles.trackerInput} ${inputError ? styles.trackerInputError : ''}`}
            placeholder="Enter project / campaign name…"
            maxLength={60}
            autoComplete="off"
            value={projectInput}
            disabled={tracker.buttonState === 'running'}
            onChange={(e) => setProjectInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className={styles.trackerControls}>
            {tracker.buttonState === 'idle' && (
              <button className={styles.primaryBtn} onClick={handleStart}>
                ▶ Start
              </button>
            )}
            {tracker.buttonState === 'running' && (
              <button className={styles.ghostBtn} onClick={tracker.stopTracker}>
                ⏹ Stop
              </button>
            )}
            {tracker.buttonState === 'stopped' && (
              <>
                <button className={styles.ghostBtn} onClick={tracker.resumeTracker}>
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
