import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSupabase,
  upsertTimeSessions,
  deleteTimeSession,
  listTimeSessionsByUser,
  subscribeToTimeSessions,
  insertActivityLog,
  getTimeTrackingPolicy,
  subscribeToAppSettings,
  type TimeSessionRow,
  type TimeTrackingPolicy,
} from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';

// --- Local session shape (mirrors app.js's localStorage session objects) --
// app.js keeps sessions in localStorage with numeric start/end/duration (ms)
// and a plain YYYY-MM-DD `date` key. This is the "source of truth" shape;
// Supabase rows (TimeSessionRow) are derived from it on every save.
export interface TrackerSession {
  id: string;
  project: string;
  date: string; // YYYY-MM-DD
  start: number; // ms epoch
  end: number; // ms epoch
  duration: number; // ms
  agentName?: string | null; // admin-managed Agent list name (see TrackerAssignment)
}

export type TrackerButtonState = 'idle' | 'running' | 'stopped';

const TRACKER_KEY = 'amber.tracker.sessions.v1';
const TRACKER_GOAL_KEY = 'amber.tracker.goal.v1';
const TRACKER_LIVE_KEY = 'amber.tracker.live.v1';

function _uuid(): string {
  // time_sessions.id is a uuid column — the fallback must be a valid v4 UUID.
  return (
    (crypto as any).randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    })
  );
}

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatMsHM(ms: number): string {
  const total = Math.floor(ms / 60000);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function loadSessionsLocal(): TrackerSession[] {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function saveSessionsLocal(sessions: TrackerSession[]) {
  localStorage.setItem(TRACKER_KEY, JSON.stringify(sessions));
}

function loadGoalLocal(): number {
  const g = parseInt(localStorage.getItem(TRACKER_GOAL_KEY) || '', 10);
  return g > 0 && g <= 24 ? g : 7;
}

function saveGoalLocal(h: number) {
  localStorage.setItem(TRACKER_GOAL_KEY, String(h));
}

interface LiveState {
  project: string;
  campaign?: string;
  account?: string;
  agentName?: string;
  sessionStart: number | null;
  elapsed: number;
  paused: boolean;
}

function rowToSession(r: TimeSessionRow): TrackerSession | null {
  if (!r.start_time || !r.end_time) return null;
  const start = new Date(r.start_time).getTime();
  const end = new Date(r.end_time).getTime();
  return {
    id: r.id,
    project: r.project_name || 'General',
    date: todayKey(new Date(start)),
    start,
    end,
    duration:
      r.duration_seconds != null ? r.duration_seconds * 1000 : Math.max(0, end - start),
    agentName: r.agent_name ?? null,
  };
}

export interface TrackerAssignment {
  campaign: string;
  account: string;
  // Who this tracked session is FOR, chosen from the admin-managed Agent
  // list (Field Options) — same concept as appointments' agent_name.
  // Independent of userId (who's signed in and saving the session).
  agentName: string;
}

function combineProjectLabel(a: TrackerAssignment): string {
  return [a.campaign.trim(), a.account.trim()].filter(Boolean).join(' — ');
}

/**
 * Encapsulates the Amber Flow time-tracker state machine, faithfully ported
 * from app.js (see startTracker/stopTracker/resumeTracker/newTrackerSession,
 * saveTrackerLiveState/restoreTrackerLiveState, and the session/goal
 * persistence helpers around TRACKER_KEY / TRACKER_GOAL_KEY / TRACKER_LIVE_KEY).
 */
export function useTimeTracker(userId: string | undefined) {
  // Tracker run state (mirrors app.js module-level trackerRunning/trackerStartTs/etc.)
  const [running, setRunning] = useState(false);
  const [project, setProject] = useState('');
  // Structured fields behind the combined `project` label (kept as a plain
  // string for storage/display compatibility with TrackerSession.project and
  // the sessions table's project_name column — no schema change needed).
  const [campaign, setCampaign] = useState('');
  const [account, setAccount] = useState('');
  const [agentName, setAgentName] = useState('');
  const [onBreak, setOnBreak] = useState(false);
  const [buttonState, setButtonState] = useState<TrackerButtonState>('idle');
  const [displayMs, setDisplayMs] = useState(0);
  const [goal, setGoalState] = useState<number>(() => loadGoalLocal());
  const [sessions, setSessions] = useState<TrackerSession[]>(() => loadSessionsLocal());
  // Admin → Settings' central Time Tracking Policy (daily goal, expected
  // work window, max break length). null until it loads, or if admin has
  // never configured one — callers fall back to the agent's own local goal.
  const [policy, setPolicy] = useState<TimeTrackingPolicy | null>(null);
  const [breakElapsedMs, setBreakElapsedMs] = useState(0);
  const breakStartTsRef = useRef<number | null>(null);

  // Refs hold the "live" numbers so the 1s interval tick doesn't need to be
  // recreated every render (same role as app.js's plain module variables).
  const trackerStartTsRef = useRef<number | null>(null); // Date.now() when current run began
  const trackerElapsedRef = useRef(0); // ms accumulated before latest start
  const trackerSessionStartRef = useRef<number | null>(null); // original session start ts
  const trackerProjectRef = useRef('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof subscribeToTimeSessions> | null>(null);

  const currentTrackerMs = useCallback((): number => {
    if (!trackerElapsedRef.current && !running) return 0;
    return trackerElapsedRef.current + (running && trackerStartTsRef.current ? Date.now() - trackerStartTsRef.current : 0);
  }, [running]);

  const saveTrackerLiveState = useCallback(() => {
    if (running || trackerElapsedRef.current) {
      const state: LiveState = {
        project: trackerProjectRef.current,
        campaign,
        account,
        agentName,
        sessionStart: trackerSessionStartRef.current,
        elapsed:
          trackerElapsedRef.current +
          (running && trackerStartTsRef.current ? Date.now() - trackerStartTsRef.current : 0),
        paused: !running,
      };
      localStorage.setItem(TRACKER_LIVE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(TRACKER_LIVE_KEY);
    }
  }, [running, campaign, account, agentName]);

  const updateDisplay = useCallback(() => {
    setDisplayMs(currentTrackerMs());
  }, [currentTrackerMs]);

  const syncSessionsToDB = useCallback(
    async (list: TrackerSession[]) => {
      if (!userId || !list.length || isDemoMode()) return;
      const completed = list.filter((s) => s.end);
      if (!completed.length) return;
      try {
        await upsertTimeSessions(
          completed.map((s) => ({
            id: s.id,
            user_id: userId,
            project_name: s.project || 'General',
            start_time: s.start ? new Date(s.start).toISOString() : new Date().toISOString(),
            end_time: s.end ? new Date(s.end).toISOString() : null,
            duration_seconds: s.duration ? Math.round(s.duration / 1000) : null,
            agent_name: s.agentName ?? null,
          }))
        );
      } catch {
        /* offline — localStorage is source of truth */
      }
    },
    [userId]
  );

  const persistSessions = useCallback(
    (next: TrackerSession[]) => {
      setSessions(next);
      saveSessionsLocal(next);
      syncSessionsToDB(next);
    },
    [syncSessionsToDB]
  );

  const setGoal = useCallback((h: number) => {
    if (h > 0 && h <= 24) {
      saveGoalLocal(h);
      setGoalState(h);
    }
  }, []);

  // --- Central Time Tracking Policy (Admin → Settings) ---------------------
  // Loads once, then stays live. An agent who has never explicitly chosen
  // their own daily goal (no TRACKER_GOAL_KEY saved yet) follows the policy's
  // goal by default — and keeps following it if admin changes it later —
  // but the moment they call setGoal() themselves, their choice sticks.
  useEffect(() => {
    if (isDemoMode()) return;
    let cancelled = false;
    function refresh() {
      getTimeTrackingPolicy().then((p) => {
        if (cancelled) return;
        setPolicy(p);
        if (p && localStorage.getItem(TRACKER_GOAL_KEY) === null) {
          setGoalState(p.dailyTrackGoalHours);
        }
      });
    }
    refresh();
    const channel = subscribeToAppSettings(refresh);
    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, []);

  // --- Load history from Supabase, then subscribe to realtime changes -----
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    let cancelled = false;

    listTimeSessionsByUser(userId).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      const mapped = data
        .map(rowToSession)
        .filter((s): s is TrackerSession => s !== null);
      if (mapped.length) {
        setSessions(mapped);
        saveSessionsLocal(mapped);
      }
    });

    const channel = subscribeToTimeSessions(userId, () => {
      listTimeSessionsByUser(userId).then(({ data, error }) => {
        if (error || !data) return;
        const mapped = data.map(rowToSession).filter((s): s is TrackerSession => s !== null);
        setSessions(mapped);
        saveSessionsLocal(mapped);
      });
    });
    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        getSupabase().removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  // --- Restore any in-progress session on mount (crash/reload recovery) ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRACKER_LIVE_KEY);
      if (!raw) return;
      const state: LiveState = JSON.parse(raw);
      if (!state.project || !state.elapsed) return;
      trackerProjectRef.current = state.project;
      trackerSessionStartRef.current = state.sessionStart || Date.now();
      trackerElapsedRef.current = state.elapsed;
      setProject(state.project);
      if (state.campaign) setCampaign(state.campaign);
      if (state.account) setAccount(state.account);
      if (state.agentName) setAgentName(state.agentName);
      if (state.paused) {
        setButtonState('stopped');
        setRunning(false);
      } else {
        trackerStartTsRef.current = Date.now();
        setRunning(true);
        setButtonState('running');
      }
      setDisplayMs(state.elapsed);
    } catch {
      /* corrupt state — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Live 1s tick while running ------------------------------------------
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(updateDisplay, 1000);
      updateDisplay();
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // --- Live 1s tick while on break (so the UI can show elapsed break time
  // and flag it once it passes the policy's max break length) -------------
  useEffect(() => {
    if (!onBreak) return;
    const id = window.setInterval(() => {
      if (breakStartTsRef.current) setBreakElapsedMs(Date.now() - breakStartTsRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [onBreak]);

  // --- Persist live state before unload (mirrors app.js's beforeunload) ---
  useEffect(() => {
    const handler = () => saveTrackerLiveState();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveTrackerLiveState]);

  // --- Goal progress --------------------------------------------------------
  const goalProgress = useMemo(() => {
    const key = todayKey();
    const savedMs = sessions.filter((s) => s.date === key).reduce((a, s) => a + (s.duration || 0), 0);
    const totalMs = savedMs + displayMs;
    const pct = Math.min(100, (totalMs / (goal * 3600000)) * 100);
    return { totalMs, pct, text: `${formatMsHM(totalMs)} / ${goal}h 0m` };
  }, [sessions, goal, displayMs]);

  // --- Actions (ports of startTracker/stopTracker/resumeTracker/newTrackerSession) --
  const startTracker = useCallback(
    (assignment: TrackerAssignment): boolean => {
      const combined = combineProjectLabel(assignment);
      if (!combined) return false;
      trackerProjectRef.current = combined;
      trackerSessionStartRef.current = Date.now();
      trackerStartTsRef.current = Date.now();
      trackerElapsedRef.current = 0;
      setProject(combined);
      setCampaign(assignment.campaign.trim());
      setAccount(assignment.account.trim());
      setAgentName(assignment.agentName.trim());
      setRunning(true);
      setButtonState('running');
      setDisplayMs(0);
      saveTrackerLiveState();
      if (userId && !isDemoMode()) {
        insertActivityLog(userId, 'START_TRACKER', { project: combined }).catch(() => {});
      }
      return true;
    },
    [saveTrackerLiveState, userId]
  );

  const stopTracker = useCallback(() => {
    if (!running && !onBreak) return;
    if (trackerStartTsRef.current) {
      trackerElapsedRef.current += Date.now() - trackerStartTsRef.current;
    }
    setRunning(false);
    setOnBreak(false);
    setButtonState('stopped');
    setDisplayMs(trackerElapsedRef.current);
    saveTrackerLiveState();
    if (userId && !isDemoMode()) {
      insertActivityLog(userId, 'STOP_TRACKER', { project: trackerProjectRef.current }).catch(() => {});
    }
  }, [running, onBreak, saveTrackerLiveState, userId]);

  // Resume re-confirms Campaign/Account/Agent (pre-filled from the paused
  // session, editable) rather than silently continuing with the old values.
  const resumeTracker = useCallback((assignment: TrackerAssignment) => {
    const combined = combineProjectLabel(assignment);
    if (!combined) return false;
    trackerProjectRef.current = combined;
    setProject(combined);
    setCampaign(assignment.campaign.trim());
    setAccount(assignment.account.trim());
    setAgentName(assignment.agentName.trim());
    trackerStartTsRef.current = Date.now();
    setRunning(true);
    setButtonState('running');
    saveTrackerLiveState();
    return true;
  }, [saveTrackerLiveState]);

  // Break pauses the clock without ending the session (buttonState stays
  // 'running' so Stop/Break remain visible) — going off break resumes
  // exactly where it left off, no re-prompt for campaign/account/agent.
  const toggleBreak = useCallback(() => {
    if (buttonState !== 'running') return;
    if (!onBreak) {
      if (trackerStartTsRef.current) {
        trackerElapsedRef.current += Date.now() - trackerStartTsRef.current;
      }
      trackerStartTsRef.current = null;
      setRunning(false);
      setDisplayMs(trackerElapsedRef.current);
      setOnBreak(true);
      breakStartTsRef.current = Date.now();
      setBreakElapsedMs(0);
      if (userId && !isDemoMode()) insertActivityLog(userId, 'START_BREAK', { project: trackerProjectRef.current }).catch(() => {});
    } else {
      trackerStartTsRef.current = Date.now();
      setRunning(true);
      setOnBreak(false);
      breakStartTsRef.current = null;
      if (userId && !isDemoMode()) insertActivityLog(userId, 'END_BREAK', { project: trackerProjectRef.current }).catch(() => {});
    }
    saveTrackerLiveState();
  }, [buttonState, onBreak, saveTrackerLiveState, userId]);

  const saveCurrentTrackerSession = useCallback(
    (list: TrackerSession[]): TrackerSession[] => {
      const ms = currentTrackerMs();
      if (!ms || !trackerProjectRef.current) return list;
      const start = trackerSessionStartRef.current || Date.now();
      const dateKey = todayKey(new Date(start));
      const next = [
        ...list,
        {
          id: _uuid(),
          project: trackerProjectRef.current,
          date: dateKey,
          start,
          end: Date.now(),
          duration: ms,
          agentName: agentName || null,
        },
      ];
      return next;
    },
    [currentTrackerMs, agentName]
  );

  const newTrackerSession = useCallback(() => {
    if (running && trackerStartTsRef.current) {
      trackerElapsedRef.current += Date.now() - trackerStartTsRef.current;
      setRunning(false);
    }
    const next = saveCurrentTrackerSession(loadSessionsLocal());
    persistSessions(next);
    localStorage.removeItem(TRACKER_LIVE_KEY);
    trackerElapsedRef.current = 0;
    trackerProjectRef.current = '';
    trackerSessionStartRef.current = null;
    trackerStartTsRef.current = null;
    setProject('');
    setCampaign('');
    setAccount('');
    setAgentName('');
    setOnBreak(false);
    setDisplayMs(0);
    setButtonState('idle');
  }, [running, saveCurrentTrackerSession, persistSessions, userId]);

  // --- Manual-entry panel support -------------------------------------------
  const addOrUpdateSession = useCallback(
    (input: { id?: string; project: string; date: string; start: number; end: number; duration: number }) => {
      const list = loadSessionsLocal();
      if (input.id) {
        const idx = list.findIndex((x) => x.id === input.id);
        if (idx !== -1) {
          const next = [...list];
          next[idx] = { ...next[idx], ...input, id: input.id };
          persistSessions(next);
          return;
        }
      }
      const next = [...list, { ...input, id: input.id || _uuid() }];
      persistSessions(next);
    },
    [persistSessions]
  );

  const deleteSession = useCallback(
    (id: string) => {
      const list = loadSessionsLocal();
      const idx = list.findIndex((x) => x.id === id);
      if (idx === -1) return;
      const next = [...list];
      next.splice(idx, 1);
      persistSessions(next);
      if (userId) deleteTimeSession(id, userId).catch(() => {});
    },
    [persistSessions, userId]
  );

  // Update the currently-running/paused live session from the manual panel
  // ("Load current session" flow — see loadCurrentIntoPanel/manualCurrentMode in app.js).
  const updateLiveFromManual = useCallback(
    (input: { project: string; sessionStart: number; duration: number }) => {
      trackerProjectRef.current = input.project;
      trackerSessionStartRef.current = input.sessionStart;
      setProject(input.project);
      if (running && trackerStartTsRef.current) {
        trackerElapsedRef.current = Math.max(0, trackerStartTsRef.current - input.sessionStart);
      } else {
        trackerElapsedRef.current = input.duration;
      }
      updateDisplay();
      saveTrackerLiveState();
    },
    [running, updateDisplay, saveTrackerLiveState]
  );

  return {
    // state
    running,
    project,
    campaign,
    account,
    agentName,
    onBreak,
    buttonState,
    displayMs,
    displayText: formatMs(displayMs),
    goal,
    sessions,
    goalProgress,
    policy,
    breakElapsedMs,
    // live-session info for the manual panel banner
    liveElapsedMs: currentTrackerMs(),
    liveSessionStart: trackerSessionStartRef.current,
    // setters
    setProject,
    setGoal,
    // actions
    startTracker,
    stopTracker,
    resumeTracker,
    toggleBreak,
    newTrackerSession,
    addOrUpdateSession,
    deleteSession,
    updateLiveFromManual,
    currentTrackerMs,
  };
}
