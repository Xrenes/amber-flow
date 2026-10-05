import { resolveAgentGoal } from './api/agentGoals';
import type { AgentGoal, Appointment, TimeSession } from './types';

// Shared calculation engine for the goal/attainment reporting feature —
// ports the "DialForce" tracking spreadsheet's Weekly/Monthly/Quarterly
// Performance sheets. Used by both the Admin Panel's team-wide
// GoalAttainmentTab and the agent-facing My Reports "Goals" tab, so the
// numbers a manager sees for an agent are guaranteed identical to what that
// agent sees for themselves — one calculation, two call sites.
//
// - Appointments  = appointments.length in the period, scoped to the agent.
// - Shows         = appointments with show_status === 'showed' in the period
//                    (the sheet's "Shows" is the same concept as Amber
//                    Flow's existing show_status field — no new tracking).
// - Active Days   = distinct calendar days with at least one time_sessions
//                    row in the period (a day the agent logged any tracked
//                    time at all).
// - Calc App/Show Goal = Active Days × the agent's resolved daily goal (see
//                    resolveAgentGoal — global by default, overridable
//                    per-agent and per-campaign).
// - Attainment %  = actual / calc goal (0% if calc goal is 0, i.e. no active
//                    days yet in the period).
// - Status        = "Meets Goal" if both attainments are >= 100%, else
//                    "Below Goal" — matches the sheet's per-row Status column.

export type PeriodKey = 'week' | 'month' | 'quarter';

export interface AgentAttainmentRow {
  userId: string;
  name: string;
  appointments: number;
  shows: number;
  activeDays: number;
  calcAppointmentGoal: number;
  calcShowGoal: number;
  appAttainmentPct: number;
  showAttainmentPct: number;
  showRatePct: number; // shows / appointments, independent of goals
  hours: number;
  avgAppsPerDay: number;
  avgShowsPerDay: number;
  meetsGoal: boolean;
}

function startOfDay(d: Date): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Confirmed against the DialForce sheet's own screenshots. Report Date only
// picks WHICH week/month/quarter is shown — it does not truncate that
// period's end, even when Report Date falls in the middle of it:
// - Week:    Report Date Sep 21 2026 -> Start Sep 21, End Sep 27 (a
//            forward-looking 7-day window STARTING on Report Date).
// - Month:   Report Date Sep 21 2026 -> Start Sep 1, End Sep 30 (the full
//            calendar month containing Report Date).
// - Quarter: Report Date Sep 21 2026 -> Start Jul 1, End Sep 30 (the full
//            calendar quarter containing Report Date).
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function startOfQuarter(d: Date): Date {
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qMonth, 1, 0, 0, 0, 0);
}

function endOfQuarter(d: Date): Date {
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return endOfDay(new Date(d.getFullYear(), qMonth + 3, 0));
}

function endOfWeek(d: Date): Date {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

export function periodRange(period: PeriodKey, reportDate: Date): { start: Date; end: Date } {
  if (period === 'week') return { start: startOfDay(reportDate), end: endOfWeek(reportDate) };
  if (period === 'month') return { start: startOfMonth(reportDate), end: endOfMonth(reportDate) };
  return { start: startOfQuarter(reportDate), end: endOfQuarter(reportDate) };
}

// Local calendar day — slicing the ISO string would give the UTC day, which
// is the wrong date for part of every day outside UTC.
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Who an appointment or time session counts for: the agent chosen on it
// (agent_name — the same attribution Reports uses), or, for older rows saved
// before agents were names, the display name of the login that saved it.
export function effectiveAgentName(
  row: { agent_name?: string | null; user_id: string },
  profileNames: Record<string, string>
): string {
  return (row.agent_name || profileNames[row.user_id] || '').trim();
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Every agent goals can be shown for: the admin-managed Agent list plus
// anyone an appointment or session in the data is attributed to — so the
// list is the same whichever account is signed in.
export function agentNamesForGoals(
  listNames: string[],
  appointments: Appointment[],
  sessions: TimeSession[],
  profileNames: Record<string, string>
): string[] {
  const byKey = new Map<string, string>();
  const add = (n: string) => {
    const name = n.trim();
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  };
  listNames.forEach(add);
  appointments.forEach((a) => add(effectiveAgentName(a, profileNames)));
  sessions.forEach((s) => add(effectiveAgentName(s, profileNames)));
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

// One agent's attainment row by agent NAME — what Reports and every login
// use. goalUserId is the login whose per-agent goal overrides apply (the
// profile with this name, if any); without one, campaign/global goals apply.
export function computeAgentNameAttainmentRow(
  agentName: string,
  appointments: Appointment[],
  sessions: TimeSession[],
  goals: AgentGoal[],
  range: { start: Date; end: Date },
  profileNames: Record<string, string>,
  goalUserId: string | null
): AgentAttainmentRow {
  return buildRow(
    goalUserId || `agent:${agentName.trim().toLowerCase()}`,
    agentName,
    appointments.filter((a) => sameName(effectiveAgentName(a, profileNames), agentName)),
    sessions.filter((s) => sameName(effectiveAgentName(s, profileNames), agentName)),
    goals,
    range,
    goalUserId || ''
  );
}

function buildRow(
  rowId: string,
  name: string,
  agentAppts: Appointment[],
  agentSessions: TimeSession[],
  goals: AgentGoal[],
  range: { start: Date; end: Date },
  goalUserId: string
): AgentAttainmentRow {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  const myAppts = agentAppts.filter((a) => {
    const t = new Date(a.scheduled_time).getTime();
    return t >= startMs && t <= endMs;
  });
  const mySessions = agentSessions.filter((s) => {
    const t = new Date(s.start_time).getTime();
    return t >= startMs && t <= endMs;
  });

  const appointmentsCount = myAppts.length;
  const shows = myAppts.filter((a) => a.show_status === 'showed').length;
  // A day counts as active if the agent tracked time OR booked an
  // appointment that day — so agents who don't use the Time Tracker still
  // get a goal. Bookings count on the day they were made (created_at).
  const activeDaySet = new Set(mySessions.map((s) => dayKey(s.start_time)));
  agentAppts.forEach((a) => {
    const booked = a.created_at || a.scheduled_time;
    const t = new Date(booked).getTime();
    if (t >= startMs && t <= endMs) activeDaySet.add(dayKey(booked));
  });
  const activeDays = activeDaySet.size;
  const hours = mySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 3600;

  // Goal resolution is per-campaign, but a row here is per-agent — most
  // agents work one dominant campaign at a time, so resolve against the
  // agent's most common campaign in this period, falling back to no
  // campaign (agent-only / global rule) if they logged none.
  const campaignCounts = new Map<string, number>();
  myAppts.forEach((a) => {
    const c = a.project_name;
    if (c) campaignCounts.set(c, (campaignCounts.get(c) || 0) + 1);
  });
  let topCampaign: string | null = null;
  let topCount = 0;
  campaignCounts.forEach((count, campaign) => {
    if (count > topCount) {
      topCount = count;
      topCampaign = campaign;
    }
  });

  const { dailyAppointmentGoal, dailyShowGoal } = resolveAgentGoal(goals, goalUserId, topCampaign, name);
  const calcAppointmentGoal = activeDays * dailyAppointmentGoal;
  const calcShowGoal = activeDays * dailyShowGoal;

  const appAttainmentPct = calcAppointmentGoal > 0 ? (appointmentsCount / calcAppointmentGoal) * 100 : 0;
  const showAttainmentPct = calcShowGoal > 0 ? (shows / calcShowGoal) * 100 : 0;
  const showRatePct = appointmentsCount > 0 ? (shows / appointmentsCount) * 100 : 0;

  return {
    userId: rowId,
    name,
    appointments: appointmentsCount,
    shows,
    activeDays,
    calcAppointmentGoal,
    calcShowGoal,
    appAttainmentPct,
    showAttainmentPct,
    showRatePct,
    hours,
    avgAppsPerDay: activeDays > 0 ? appointmentsCount / activeDays : 0,
    avgShowsPerDay: activeDays > 0 ? shows / activeDays : 0,
    meetsGoal: appAttainmentPct >= 100 && showAttainmentPct >= 100,
  };
}
