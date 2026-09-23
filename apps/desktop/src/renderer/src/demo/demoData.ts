// Local-only demo mode: no Supabase account, no network calls. Lets someone
// click through the whole app before the backend (migrations + Worker) is
// deployed. Flip off by clearing localStorage['amber.demoMode'] or signing out.
import type {
  Task,
  Appointment,
  TimeSession,
  Profile,
  ActivityLog,
  Plugin,
  AccountRequest,
} from '@amber-flow/shared';

export const DEMO_FLAG_KEY = 'amber.demoMode';
export const DEMO_USER_ID = 'demo-user-0000-0000-0000-000000000000';

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_FLAG_KEY, '1');
    else localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* noop */
  }
}

export const demoProfile: Profile = {
  id: DEMO_USER_ID,
  name: 'Demo User',
  username: 'demo',
  telegram_chat_id: null,
  role: 'admin',
  status: 'active',
};

const today = new Date();
function isoDate(daysFromNow: number) {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
function isoDateTime(daysFromNow: number, hour: number) {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export const demoTasks: Task[] = [
  {
    id: 'demo-task-1',
    user_id: DEMO_USER_ID,
    title: 'Follow up with client about proposal',
    description: 'They asked for a revised quote by Friday.',
    date: isoDate(0),
    time: '14:00',
    reminder_minutes: 30,
    completed: false,
    lead_status: 'S',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    agent_name: 'Demo User',
    account_name: 'Upwork - Acme Co',
    campaign_name: 'Q4 Outreach',
  },
  {
    id: 'demo-task-2',
    user_id: DEMO_USER_ID,
    title: 'Send onboarding docs',
    description: null,
    date: isoDate(1),
    time: '10:00',
    reminder_minutes: 60,
    completed: false,
    lead_status: 'NS',
    timezone: null,
    agent_name: 'Demo User',
    account_name: null,
    campaign_name: 'Q4 Outreach',
  },
  {
    id: 'demo-task-3',
    user_id: DEMO_USER_ID,
    title: 'Weekly report',
    description: null,
    date: isoDate(-1),
    time: '17:00',
    reminder_minutes: 0,
    completed: true,
    lead_status: 'C',
    timezone: null,
    agent_name: 'Demo User',
    account_name: null,
    campaign_name: null,
  },
];

export const demoAppointments: Appointment[] = [
  {
    id: 'demo-appt-1',
    user_id: DEMO_USER_ID,
    project_name: 'Acme Co',
    title: 'Discovery call',
    description: 'Intro call with the new lead.',
    scheduled_time: isoDateTime(0, 16),
    reminder_minutes: 15,
    status: 'pending',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  {
    id: 'demo-appt-2',
    user_id: DEMO_USER_ID,
    project_name: 'Beta LLC',
    title: 'Contract review',
    description: null,
    scheduled_time: isoDateTime(-1, 11),
    reminder_minutes: 15,
    status: 'completed',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
];

export const demoSessions: TimeSession[] = [
  {
    id: 'demo-session-1',
    user_id: DEMO_USER_ID,
    project_name: 'Acme Co',
    start_time: isoDateTime(0, 9),
    end_time: isoDateTime(0, 12),
    duration_seconds: 3 * 3600,
    status: 'completed',
  },
  {
    id: 'demo-session-2',
    user_id: DEMO_USER_ID,
    project_name: 'Internal',
    start_time: isoDateTime(-1, 9),
    end_time: isoDateTime(-1, 13),
    duration_seconds: 4 * 3600,
    status: 'completed',
  },
];

export const demoActivityLogs: ActivityLog[] = [
  {
    id: 'demo-log-1',
    user_id: DEMO_USER_ID,
    action_type: 'START_TRACKER',
    reference_id: null,
    metadata: { project: 'Acme Co' },
    created_at: isoDateTime(0, 9),
  },
];

export const demoPlugins: Plugin[] = [
  {
    id: 'idle-status',
    name: 'Idle/Active Status',
    description: 'Shows each agent as Active, Idle, or Away in real time, based on keyboard/mouse activity.',
    enabled: false,
  },
  {
    id: 'productivity-reports',
    name: 'Productivity Reports',
    description: 'Per-agent, per-date-range report of hours worked, tasks completed, and appointment outcomes.',
    enabled: true,
  },
];

export const demoAccountRequests: AccountRequest[] = [
  {
    id: 'demo-req-1',
    name: 'Jordan Lee',
    contact: 'jordan@example.com',
    note: 'Referred by the team lead.',
    status: 'pending',
    created_at: isoDateTime(-2, 10),
    reviewed_at: null,
    reviewed_by: null,
  },
];
