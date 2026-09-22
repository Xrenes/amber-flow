import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatMs, formatMsHM, todayKey, type TrackerSession } from './useTimeTracker';
import type { useTimeTracker } from './useTimeTracker';
import styles from './ManualEntryPanel.module.css';

type Tracker = ReturnType<typeof useTimeTracker>;

interface ManualEntryPanelProps {
  tracker: Tracker;
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Port of app.js's parseTimeField: combine a date (YYYY-MM-DD) + time
// (HH:MM:SS) string into a Date, or null if either is missing/invalid.
export function parseTimeField(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}`);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtTime(dt: Date): string {
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

interface UniqueProject {
  name: string;
  total: number;
}

function getUniqueProjects(sessions: TrackerSession[]): UniqueProject[] {
  const map = new Map<string, UniqueProject>();
  sessions.forEach((s) => {
    const key = (s.project || '').trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, { name: s.project, total: 0 });
    map.get(key)!.total += s.duration || 0;
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Secret manual time-entry panel (normally revealed by triple-clicking the
// tracker icon — see TimeTracker.tsx). Faithful port of app.js's
// openManualPanel/loadCurrentIntoPanel/syncDur/setupSyncDur/
// renderPanelSessionList/parseTimeField and the mp-combo autocomplete.
export default function ManualEntryPanel({ tracker, onClose }: ManualEntryPanelProps) {
  const [editId, setEditId] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState(false); // editing the live running/paused session

  const [project, setProject] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [durH, setDurH] = useState('');
  const [durM, setDurM] = useState('');
  const [durS, setDurS] = useState('');
  const [error, setError] = useState('');
  const [durPreview, setDurPreview] = useState<string | null>(null);
  const [dividerText, setDividerText] = useState('— or set duration directly —');
  const [panelTitle] = useState('Edit Session');
  const [submitLabel, setSubmitLabel] = useState('Save Session');

  const [comboOpen, setComboOpen] = useState(false);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActive = tracker.running || tracker.liveElapsedMs > 0;

  // -- Initialize form for "Add new" mode on open --------------------------
  useEffect(() => {
    const now = new Date();
    const ago = new Date(now.getTime() - 3600000);
    setDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setEnd(`${pad(now.getHours())}:${pad(now.getMinutes())}:00`);
    setStart(`${pad(ago.getHours())}:${pad(ago.getMinutes())}:00`);
    setProject(tracker.project || '');
    setDurH('');
    setDurM('');
    setDurS('');
    setDividerText('— or set duration directly —');
    setSubmitLabel('Save Session');
    setError('');
    setDurPreview(null);
    const t = setTimeout(() => projectInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadExistingSession(session: TrackerSession) {
    setEditId(session.id);
    setCurrentMode(false);
    const startDt = new Date(session.start);
    const endDt = new Date(session.end);
    setDate(session.date);
    setProject(session.project || '');
    setStart(`${pad(startDt.getHours())}:${pad(startDt.getMinutes())}:${pad(startDt.getSeconds())}`);
    setEnd(`${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:${pad(endDt.getSeconds())}`);
    const diff = Math.floor((session.duration || 0) / 1000);
    setDurH(String(Math.floor(diff / 3600)));
    setDurM(String(Math.floor((diff % 3600) / 60)));
    setDurS(String(diff % 60));
    setDividerText('— or override duration directly —');
    setSubmitLabel('Save Changes');
    setError('');
    setDurPreview(null);
  }

  function loadCurrentIntoPanel() {
    setCurrentMode(true);
    setEditId(null);
    const now = new Date();
    const sessionStartTs = tracker.liveSessionStart || Date.now() - tracker.liveElapsedMs;
    const startDt = new Date(sessionStartTs);
    setDate(`${startDt.getFullYear()}-${pad(startDt.getMonth() + 1)}-${pad(startDt.getDate())}`);
    setProject(tracker.project || '');
    setStart(`${pad(startDt.getHours())}:${pad(startDt.getMinutes())}:${pad(startDt.getSeconds())}`);
    if (tracker.running) {
      setEnd(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    } else {
      const endTs = sessionStartTs + tracker.liveElapsedMs;
      const endDt = new Date(endTs);
      setEnd(`${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:${pad(endDt.getSeconds())}`);
    }
    const diff = Math.floor(tracker.liveElapsedMs / 1000);
    setDurH(String(Math.floor(diff / 3600)));
    setDurM(String(Math.floor((diff % 3600) / 60)));
    setDurS(String(diff % 60));
    setDividerText('— or adjust elapsed directly —');
    setSubmitLabel('Update Timer');
    setError('');
  }

  // -- Duration <-> start/end sync (port of syncDur) ------------------------
  useEffect(() => {
    const s = parseTimeField(date, start);
    const e = parseTimeField(date, end);
    if (s && e && e > s) {
      const diff = Math.floor((e.getTime() - s.getTime()) / 1000);
      setDurH(String(Math.floor(diff / 3600)));
      setDurM(String(Math.floor((diff % 3600) / 60)));
      setDurS(String(diff % 60));
      setDurPreview(`${formatMs(diff * 1000)}  (${fmtTime(s)} → ${fmtTime(e)})`);
      setError('');
    } else if (s && e && e <= s) {
      setError('End time must be after start time.');
      setDurPreview(null);
    } else {
      const dH = parseInt(durH, 10) || 0;
      const dM = parseInt(durM, 10) || 0;
      const dS = parseInt(durS, 10) || 0;
      const durMs = (dH * 3600 + dM * 60 + dS) * 1000;
      setDurPreview(durMs > 0 ? `Duration: ${formatMs(durMs)}` : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, start, end]);

  // Manual duration-field edits also refresh the preview directly (matches
  // app.js's setupSyncDur oninput handlers on the H/M/S fields).
  function handleDurFieldChange(setter: (v: string) => void, raw: string) {
    setter(raw);
    setError('');
  }

  const sortedSessions = useMemo(
    () => tracker.sessions.slice().sort((a, b) => b.start - a.start),
    [tracker.sessions]
  );

  const comboProjects = useMemo(() => getUniqueProjects(tracker.sessions), [tracker.sessions]);
  const comboFiltered = useMemo(() => {
    const ft = project.trim().toLowerCase();
    return ft ? comboProjects.filter((p) => p.name.toLowerCase().includes(ft)) : comboProjects;
  }, [comboProjects, project]);
  const comboExactMatch = comboProjects.some((p) => p.name.toLowerCase() === project.trim().toLowerCase());

  function openCombo() {
    setComboOpen(true);
  }
  function closeCombo() {
    setComboOpen(false);
  }
  function handleProjectBlur() {
    blurTimerRef.current = setTimeout(closeCombo, 150);
  }
  function pickProject(name: string) {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    setProject(name);
    closeCombo();
    projectInputRef.current?.focus();
  }

  function handleSubmit() {
    const trimmedProject = project.trim();
    if (!trimmedProject) {
      setError('Project name is required.');
      projectInputRef.current?.focus();
      return;
    }
    if (!date) {
      setError('Please select a date.');
      return;
    }

    const startDt = parseTimeField(date, start);
    const endDt = parseTimeField(date, end);
    const dH = parseInt(durH, 10) || 0;
    const dM = parseInt(durM, 10) || 0;
    const dS = parseInt(durS, 10) || 0;
    const durMs = (dH * 3600 + dM * 60 + dS) * 1000;

    let sessionStart: number;
    let sessionEnd: number;
    let duration: number;

    if (startDt && endDt && endDt > startDt) {
      sessionStart = startDt.getTime();
      sessionEnd = endDt.getTime();
      duration = sessionEnd - sessionStart;
    } else if (durMs > 0) {
      sessionEnd = startDt ? startDt.getTime() + durMs : Date.now();
      sessionStart = sessionEnd - durMs;
      duration = durMs;
    } else {
      setError('Enter a valid start + end time, or a duration > 0.');
      return;
    }

    if (currentMode) {
      tracker.updateLiveFromManual({ project: trimmedProject, sessionStart, duration });
    } else if (editId !== null) {
      tracker.addOrUpdateSession({
        id: editId,
        project: trimmedProject,
        date,
        start: sessionStart,
        end: sessionEnd,
        duration,
      });
    } else {
      tracker.addOrUpdateSession({
        project: trimmedProject,
        date,
        start: sessionStart,
        end: sessionEnd,
        duration,
      });
    }
    onClose();
  }

  function handleDelete(id: string) {
    tracker.deleteSession(id);
  }

  function handleEdit(session: TrackerSession) {
    loadExistingSession(session);
  }

  // Escape closes the panel (matches app.js's document keydown handler).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Manual session entry">
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            <span>{panelTitle}</span>
          </div>
          <button className={styles.iconBtn} aria-label="Close" onClick={onClose}>
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.panelBody}>
          <label className={styles.label}>
            <span>Project / Campaign</span>
            <div className={styles.combo}>
              <input
                ref={projectInputRef}
                type="text"
                className={`${styles.trackerInput} ${styles.comboInput}`}
                placeholder="Type or select a project…"
                maxLength={60}
                autoComplete="off"
                value={project}
                onFocus={openCombo}
                onChange={(e) => {
                  setProject(e.target.value);
                  setComboOpen(true);
                }}
                onBlur={handleProjectBlur}
              />
              <button
                type="button"
                className={`${styles.comboArrow} ${comboOpen ? styles.open : ''}`}
                aria-label="Show projects"
                tabIndex={-1}
                onClick={() => {
                  if (!comboOpen) {
                    projectInputRef.current?.focus();
                    openCombo();
                  } else {
                    closeCombo();
                  }
                }}
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
              </button>
              {comboOpen && (
                <ul className={styles.comboList} role="listbox">
                  {!comboFiltered.length && !project.trim() && (
                    <li className={styles.comboEmpty}>No previous projects yet</li>
                  )}
                  {comboFiltered.map((p) => (
                    <li
                      key={p.name.toLowerCase()}
                      className={styles.comboItem}
                      role="option"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickProject(p.name);
                      }}
                    >
                      <span className={styles.comboItemDot} />
                      <span>{p.name}</span>
                      <span className={styles.comboItemTime}>{formatMsHM(p.total)}</span>
                    </li>
                  ))}
                  {project.trim() && !comboExactMatch && (
                    <>
                      {comboFiltered.length > 0 && <li className={styles.comboDivider} role="separator" />}
                      <li
                        className={`${styles.comboItem} ${styles.comboNew}`}
                        role="option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickProject(project.trim());
                        }}
                      >
                        <span className={styles.comboItemDot} />
                        New: <strong>{project.trim()}</strong>
                      </li>
                    </>
                  )}
                </ul>
              )}
            </div>
          </label>

          {hasActive && (
            <div className={styles.currentBanner}>
              <div className={styles.mcbInfo}>
                <span className={styles.mcbLiveDot} />
                <div>
                  <div className={styles.mcbProject}>{tracker.project || 'Unnamed session'}</div>
                  <div className={styles.mcbElapsed}>{formatMs(tracker.liveElapsedMs)} elapsed</div>
                </div>
              </div>
              <button type="button" className={styles.mcbLoadBtn} onClick={loadCurrentIntoPanel}>
                Load ↓
              </button>
            </div>
          )}

          <div className={styles.row}>
            <label className={styles.label}>
              <span>Date</span>
              <input
                type="date"
                className={styles.trackerInput}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.label}>
              <span>Start time</span>
              <input
                type="time"
                step={1}
                className={styles.trackerInput}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              <span>End time</span>
              <input
                type="time"
                step={1}
                className={styles.trackerInput}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.divider}>
            <span>{dividerText}</span>
          </div>
          <div className={`${styles.row} ${styles.durRow}`}>
            <label className={`${styles.label} ${styles.labelSm}`}>
              <span>Hours</span>
              <input
                type="number"
                className={`${styles.trackerGoalField} ${styles.durField}`}
                min={0}
                max={23}
                placeholder="0"
                value={durH}
                onChange={(e) => handleDurFieldChange(setDurH, e.target.value)}
              />
            </label>
            <label className={`${styles.label} ${styles.labelSm}`}>
              <span>Minutes</span>
              <input
                type="number"
                className={`${styles.trackerGoalField} ${styles.durField}`}
                min={0}
                max={59}
                placeholder="0"
                value={durM}
                onChange={(e) => handleDurFieldChange(setDurM, e.target.value)}
              />
            </label>
            <label className={`${styles.label} ${styles.labelSm}`}>
              <span>Seconds</span>
              <input
                type="number"
                className={`${styles.trackerGoalField} ${styles.durField}`}
                min={0}
                max={59}
                placeholder="0"
                value={durS}
                onChange={(e) => handleDurFieldChange(setDurS, e.target.value)}
              />
            </label>
          </div>

          {durPreview && (
            <div className={styles.durPreview}>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{durPreview}</span>
            </div>
          )}

          <div className={styles.slWrap}>
            <div className={styles.slHeader}>
              <svg
                viewBox="0 0 24 24"
                width="11"
                height="11"
                stroke="currentColor"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Logged Sessions</span>
              <span className={styles.slCount}>{sortedSessions.length ? `(${sortedSessions.length})` : ''}</span>
            </div>
            <div className={styles.sessionList}>
              {!sortedSessions.length && <p className={styles.slEmpty}>No sessions logged yet.</p>}
              {sortedSessions.map((s) => {
                const t1 = new Date(s.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const t2 = new Date(s.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const dl = s.date === today ? 'Today' : s.date === yesterday ? 'Yesterday' : s.date;
                return (
                  <div key={s.id} className={styles.slItem}>
                    <div className={styles.slMain}>
                      <div className={styles.slTop}>
                        <span className={styles.slProj}>{s.project || '—'}</span>
                        <span className={styles.slDateTag}>{dl}</span>
                      </div>
                      <span className={styles.slTimes}>
                        {t1} – {t2} &nbsp;·&nbsp; {formatMsHM(s.duration || 0)}
                      </span>
                    </div>
                    <div className={styles.slActions}>
                      <button className={styles.slEdit} title="Edit session" onClick={() => handleEdit(s)}>
                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button className={styles.slDel} title="Delete session" onClick={() => handleDelete(s.id)}>
                        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button className={styles.ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button className={styles.primaryBtn} onClick={handleSubmit}>
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
