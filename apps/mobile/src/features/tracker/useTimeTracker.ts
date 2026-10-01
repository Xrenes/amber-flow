import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSupabase,
  upsertTimeSessions,
  listTimeSessionsByUser,
  subscribeToTimeSessions,
  insertActivityLog,
  type TimeSessionRow,
} from '@amber-flow/shared';

// Mobile port of the desktop Time Tracker hook. The desktop version treats
// localStorage as the synchronous source of truth for sessions/goal/live
// state; AsyncStorage on React Native is async-only, so this version keeps
// everything in React state/refs as the real source of truth and treats
// AsyncStorage purely as best-effort background persistence (for crash
// recovery of an in-progress session), restored via an async effect on
// mount instead of a synchronous initializer.
export interface TrackerSession {
  id: string;
  project: string;
  date: string; // YYYY-MM-DD
  start: number; // ms epoch
  end: number; // ms epoch
  duration: number; // ms
}

export type TrackerButtonState = 'idle' | 'running' | 'stopped';

const TRACKER_GOAL_KEY = 'amber.tracker.goal.v1';
const TRACKER_LIVE_KEY = 'amber.tracker.live.v1';

// time_sessions.id is a uuid column, so the fallback (Hermes has no
// crypto.randomUUID) must still be a valid v4 UUID or the save is rejected.
function genUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
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

interface LiveState {
  project: string;
  campaign?: string;
  account?: string;
  assignedUserId?: string;
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
    duration: r.duration_seconds != null ? r.duration_seconds * 1000 : Math.max(0, end - start),
  };
}

export interface TrackerAssignment {
  campaign: string;
  account: string;
  assignedUserId: string;
}

function combineProjectLabel(a: TrackerAssignment): string {
  return [a.campaign.trim(), a.account.trim()].filter(Boolean).join(' — ');
}

export function useTimeTracker(userId: string | undefined) {
  const [running, setRunning] = useState(false);
  const [project, setProject] = useState('');
  const [campaign, setCampaign] = useState('');
  const [account, setAccount] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(userId || '');
  const [onBreak, setOnBreak] = useState(false);
  const [buttonState, setButtonState] = useState<TrackerButtonState>('idle');
  const [displayMs, setDisplayMs] = useState(0);
  const [goal, setGoalState] = useState(7);
  const [sessions, setSessions] = useState<TrackerSession[]>([]);

  const trackerStartTsRef = useRef<number | null>(null);
  const trackerElapsedRef = useRef(0);
  const trackerSessionStartRef = useRef<number | null>(null);
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
        assignedUserId,
        sessionStart: trackerSessionStartRef.current,
        elapsed:
          trackerElapsedRef.current + (running && trackerStartTsRef.current ? Date.now() - trackerStartTsRef.current : 0),
        paused: !running,
      };
      AsyncStorage.setItem(TRACKER_LIVE_KEY, JSON.stringify(state)).catch(() => {});
    } else {
      AsyncStorage.removeItem(TRACKER_LIVE_KEY).catch(() => {});
    }
  }, [running, campaign, account, assignedUserId]);

  const updateDisplay = useCallback(() => {
    setDisplayMs(currentTrackerMs());
  }, [currentTrackerMs]);

  const setGoal = useCallback((h: number) => {
    if (h > 0 && h <= 24) {
      setGoalState(h);
      AsyncStorage.setItem(TRACKER_GOAL_KEY, String(h)).catch(() => {});
    }
  }, []);

  // Load the saved daily goal once on mount.
  useEffect(() => {
    AsyncStorage.getItem(TRACKER_GOAL_KEY).then((raw) => {
      const g = parseInt(raw || '', 10);
      if (g > 0 && g <= 24) setGoalState(g);
    });
  }, []);

  useEffect(() => {
    if (userId && !assignedUserId) setAssignedUserId(userId);
  }, [userId, assignedUserId]);

  // Load history from Supabase, then subscribe to realtime changes — this is
  // the authoritative session list (no local cache layer, unlike desktop).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    listTimeSessionsByUser(userId).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      const mapped = data.map(rowToSession).filter((s): s is TrackerSession => s !== null);
      setSessions(mapped);
    });

    const channel = subscribeToTimeSessions(userId, () => {
      listTimeSessionsByUser(userId).then(({ data, error }) => {
        if (error || !data) return;
        setSessions(data.map(rowToSession).filter((s): s is TrackerSession => s !== null));
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

  // Restore any in-progress session on mount (app killed mid-session).
  useEffect(() => {
    AsyncStorage.getItem(TRACKER_LIVE_KEY)
      .then((raw) => {
        if (!raw) return;
        const state: LiveState = JSON.parse(raw);
        if (!state.project || !state.elapsed) return;
        trackerProjectRef.current = state.project;
        trackerSessionStartRef.current = state.sessionStart || Date.now();
        trackerElapsedRef.current = state.elapsed;
        setProject(state.project);
        if (state.campaign) setCampaign(state.campaign);
        if (state.account) setAccount(state.account);
        if (state.assignedUserId) setAssignedUserId(state.assignedUserId);
        if (state.paused) {
          setButtonState('stopped');
          setRunning(false);
        } else {
          trackerStartTsRef.current = Date.now();
          setRunning(true);
          setButtonState('running');
        }
        setDisplayMs(state.elapsed);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live 1s tick while running.
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

  const goalProgress = useMemo(() => {
    const key = todayKey();
    const savedMs = sessions.filter((s) => s.date === key).reduce((a, s) => a + (s.duration || 0), 0);
    const totalMs = savedMs + displayMs;
    const pct = Math.min(100, (totalMs / (goal * 3600000)) * 100);
    return { totalMs, pct, text: `${formatMsHM(totalMs)} / ${goal}h 0m` };
  }, [sessions, goal, displayMs]);

  const startTracker = useCallback(
    (assignment: TrackerAssignment, via: 'button' | 'qr' = 'button'): boolean => {
      const combined = combineProjectLabel(assignment);
      if (!combined) return false;
      trackerProjectRef.current = combined;
      trackerSessionStartRef.current = Date.now();
      trackerStartTsRef.current = Date.now();
      trackerElapsedRef.current = 0;
      setProject(combined);
      setCampaign(assignment.campaign.trim());
      setAccount(assignment.account.trim());
      setAssignedUserId(assignment.assignedUserId);
      setRunning(true);
      setButtonState('running');
      setDisplayMs(0);
      saveTrackerLiveState();
      if (userId) insertActivityLog(userId, 'START_TRACKER', { project: combined, via }).catch(() => {});
      return true;
    },
    [saveTrackerLiveState, userId]
  );

  const stopTracker = useCallback(
    (via: 'button' | 'qr' = 'button') => {
      if (!running && !onBreak) return;
      if (trackerStartTsRef.current) {
        trackerElapsedRef.current += Date.now() - trackerStartTsRef.current;
      }
      setRunning(false);
      setOnBreak(false);
      setButtonState('stopped');
      setDisplayMs(trackerElapsedRef.current);
      saveTrackerLiveState();
      if (userId) insertActivityLog(userId, 'STOP_TRACKER', { project: trackerProjectRef.current, via }).catch(() => {});
    },
    [running, onBreak, saveTrackerLiveState, userId]
  );

  const resumeTracker = useCallback(
    (assignment: TrackerAssignment, via: 'button' | 'qr' = 'button') => {
      const combined = combineProjectLabel(assignment);
      if (!combined) return false;
      trackerProjectRef.current = combined;
      setProject(combined);
      setCampaign(assignment.campaign.trim());
      setAccount(assignment.account.trim());
      setAssignedUserId(assignment.assignedUserId);
      trackerStartTsRef.current = Date.now();
      setRunning(true);
      setButtonState('running');
      saveTrackerLiveState();
      if (userId) insertActivityLog(userId, 'RESUME_TRACKER', { project: combined, via }).catch(() => {});
      return true;
    },
    [saveTrackerLiveState, userId]
  );

  const toggleBreak = useCallback(
    (via: 'button' | 'qr' = 'button') => {
      if (buttonState !== 'running') return;
      if (!onBreak) {
        if (trackerStartTsRef.current) {
          trackerElapsedRef.current += Date.now() - trackerStartTsRef.current;
        }
        trackerStartTsRef.current = null;
        setRunning(false);
        setDisplayMs(trackerElapsedRef.current);
        setOnBreak(true);
        if (userId) insertActivityLog(userId, 'START_BREAK', { project: trackerProjectRef.current, via }).catch(() => {});
      } else {
        trackerStartTsRef.current = Date.now();
        setRunning(true);
        setOnBreak(false);
        if (userId) insertActivityLog(userId, 'END_BREAK', { project: trackerProjectRef.current, via }).catch(() => {});
      }
      saveTrackerLiveState();
    },
    [buttonState, onBreak, saveTrackerLiveState, userId]
  );

  // Ends the current session and syncs it straight to Supabase — no local
  // session cache layer to merge into first, unlike the desktop hook.
  const newTrackerSession = useCallback(() => {
    if (running && trackerStartTsRef.current) {
      trackerElapsedRef.current += Date.now() - trackerStartTsRef.current;
      setRunning(false);
    }
    const ms = currentTrackerMs();
    const proj = trackerProjectRef.current;
    if (ms && proj && userId) {
      const start = trackerSessionStartRef.current || Date.now();
      const end = Date.now();
      upsertTimeSessions([
        {
          id: genUuid(),
          user_id: userId,
          project_name: proj,
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          duration_seconds: Math.round(ms / 1000),
        },
      ]).catch(() => {});
    }
    AsyncStorage.removeItem(TRACKER_LIVE_KEY).catch(() => {});
    trackerElapsedRef.current = 0;
    trackerProjectRef.current = '';
    trackerSessionStartRef.current = null;
    trackerStartTsRef.current = null;
    setProject('');
    setCampaign('');
    setAccount('');
    setAssignedUserId(userId || '');
    setOnBreak(false);
    setDisplayMs(0);
    setButtonState('idle');
  }, [running, currentTrackerMs, userId]);

  return {
    running,
    project,
    campaign,
    account,
    assignedUserId,
    onBreak,
    buttonState,
    displayMs,
    displayText: formatMs(displayMs),
    goal,
    sessions,
    goalProgress,
    liveElapsedMs: currentTrackerMs(),
    liveSessionStart: trackerSessionStartRef.current,
    setGoal,
    startTracker,
    stopTracker,
    resumeTracker,
    toggleBreak,
    newTrackerSession,
    currentTrackerMs,
  };
}
