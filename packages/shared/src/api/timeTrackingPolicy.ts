import { getAppSetting, setAppSetting } from './appSettings';

// Company-wide time-tracking policy, set once centrally (Admin → Settings)
// instead of each agent configuring their own daily goal on their own
// device. Stored as one JSON value in app_settings (see
// migrations/014_app_settings.sql) — admin/manager write, everyone can
// read, live via subscribeToAppSettings (already exported from
// api/appSettings.ts).
export interface TimeTrackingPolicy {
  // How long an agent is expected to track in a day.
  dailyTrackGoalHours: number;
  // The expected work window, "HH:MM" 24h — informational (shown to
  // agents and on reports), not a hard block on starting the tracker
  // outside it.
  workStart: string;
  workEnd: string;
  // How long a single break may run before the tracker flags it as
  // over the limit (soft warning, not an auto-stop).
  maxBreakMinutes: number;
}

const SETTING_KEY = 'time_tracking_policy';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_TIME_TRACKING_POLICY: TimeTrackingPolicy = {
  dailyTrackGoalHours: 7,
  workStart: '09:00',
  workEnd: '18:00',
  maxBreakMinutes: 30,
};

// Never trusts a stored value blindly — a hand-edited app_settings row
// (or a future format change) could otherwise feed garbage straight into
// the tracker UI's math.
function clampPolicy(p: Partial<TimeTrackingPolicy> | null | undefined): TimeTrackingPolicy {
  const hours = Number(p?.dailyTrackGoalHours);
  const breakMin = Number(p?.maxBreakMinutes);
  return {
    dailyTrackGoalHours: Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : DEFAULT_TIME_TRACKING_POLICY.dailyTrackGoalHours,
    workStart: typeof p?.workStart === 'string' && TIME_RE.test(p.workStart) ? p.workStart : DEFAULT_TIME_TRACKING_POLICY.workStart,
    workEnd: typeof p?.workEnd === 'string' && TIME_RE.test(p.workEnd) ? p.workEnd : DEFAULT_TIME_TRACKING_POLICY.workEnd,
    maxBreakMinutes:
      Number.isFinite(breakMin) && breakMin > 0 && breakMin <= 480 ? breakMin : DEFAULT_TIME_TRACKING_POLICY.maxBreakMinutes,
  };
}

// null = no policy has been saved yet (caller decides its own fallback,
// e.g. the agent's existing local goal); once admin saves one, every
// reader gets the same, validated values.
export async function getTimeTrackingPolicy(): Promise<TimeTrackingPolicy | null> {
  const raw = await getAppSetting(SETTING_KEY);
  if (!raw) return null;
  try {
    return clampPolicy(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setTimeTrackingPolicy(policy: TimeTrackingPolicy) {
  return setAppSetting(SETTING_KEY, JSON.stringify(clampPolicy(policy)));
}
