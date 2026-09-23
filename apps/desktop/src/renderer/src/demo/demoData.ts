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
  EvaluationCriterion,
  Evaluation,
  EvaluationScore,
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

// A small demo team — the logged-in Demo User (admin) plus three agents —
// so admin-facing views (Overview, Attendance, Appointments, Tasks, Time
// Log) show a real multi-person picture instead of a single row.
const AGENT_2 = 'demo-agent-2222-2222-2222-222222222222';
const AGENT_3 = 'demo-agent-3333-3333-3333-333333333333';
const AGENT_4 = 'demo-agent-4444-4444-4444-444444444444';

export const demoProfiles: Profile[] = [
  demoProfile,
  { id: AGENT_2, name: 'Priya Nair', username: 'priya', telegram_chat_id: null, role: 'agent', status: 'active' },
  { id: AGENT_3, name: 'Carlos Mendez', username: 'carlos', telegram_chat_id: null, role: 'agent', status: 'active' },
  { id: AGENT_4, name: 'Aisha Bello', username: 'aisha', telegram_chat_id: null, role: 'manager', status: 'active' },
];

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
  {
    id: 'demo-task-4',
    user_id: AGENT_2,
    title: 'Prep demo deck for Cloudora',
    description: null,
    date: isoDate(0),
    time: '11:00',
    reminder_minutes: 30,
    completed: false,
    lead_status: 'S',
    timezone: null,
    agent_name: 'Priya Nair',
    account_name: 'Upwork - Cloudora',
    campaign_name: 'Q4 Outreach',
  },
  {
    id: 'demo-task-5',
    user_id: AGENT_2,
    title: 'Log yesterday\'s call notes',
    description: null,
    date: isoDate(-1),
    time: '18:00',
    reminder_minutes: 0,
    completed: true,
    lead_status: 'C',
    timezone: null,
    agent_name: 'Priya Nair',
    account_name: null,
    campaign_name: null,
  },
  {
    id: 'demo-task-6',
    user_id: AGENT_3,
    title: 'Chase overdue invoice — NovaRetail',
    description: null,
    date: isoDate(-2),
    time: '09:00',
    reminder_minutes: 15,
    completed: false,
    lead_status: 'NS',
    timezone: null,
    agent_name: 'Carlos Mendez',
    account_name: 'Upwork - NovaRetail',
    campaign_name: null,
  },
  {
    id: 'demo-task-7',
    user_id: AGENT_4,
    title: 'Review team pipeline',
    description: null,
    date: isoDate(0),
    time: '16:00',
    reminder_minutes: 30,
    completed: false,
    lead_status: 'S',
    timezone: null,
    agent_name: 'Aisha Bello',
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
    show_status: null,
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
    show_status: 'showed',
  },
  {
    id: 'demo-appt-3',
    user_id: DEMO_USER_ID,
    project_name: 'Acme Co',
    title: 'Follow-up demo',
    description: null,
    scheduled_time: isoDateTime(-2, 14),
    reminder_minutes: 15,
    status: 'completed',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    show_status: 'no_show',
  },
  {
    id: 'demo-appt-4',
    user_id: AGENT_2,
    project_name: 'Cloudora',
    title: 'Product walkthrough',
    description: null,
    scheduled_time: isoDateTime(0, 13),
    reminder_minutes: 15,
    status: 'pending',
    timezone: null,
    show_status: null,
  },
  {
    id: 'demo-appt-5',
    user_id: AGENT_2,
    project_name: 'Cloudora',
    title: 'Pricing follow-up',
    description: null,
    scheduled_time: isoDateTime(-1, 15),
    reminder_minutes: 15,
    status: 'completed',
    timezone: null,
    show_status: 'showed',
  },
  {
    id: 'demo-appt-6',
    user_id: AGENT_3,
    project_name: 'NovaRetail',
    title: 'Renewal call',
    description: null,
    scheduled_time: isoDateTime(-2, 10),
    reminder_minutes: 15,
    status: 'completed',
    timezone: null,
    show_status: 'no_show',
  },
  {
    id: 'demo-appt-7',
    user_id: AGENT_4,
    project_name: 'MetricMint',
    title: 'Kickoff call',
    description: null,
    scheduled_time: isoDateTime(1, 9),
    reminder_minutes: 30,
    status: 'pending',
    timezone: null,
    show_status: null,
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
  {
    id: 'demo-session-3',
    user_id: AGENT_2,
    project_name: 'Cloudora',
    start_time: isoDateTime(0, 8),
    end_time: isoDateTime(0, 13),
    duration_seconds: Math.round(4.5 * 3600),
    status: 'completed',
  },
  {
    id: 'demo-session-4',
    user_id: AGENT_2,
    project_name: 'Cloudora',
    start_time: isoDateTime(-1, 9),
    end_time: isoDateTime(-1, 17),
    duration_seconds: 8 * 3600,
    status: 'completed',
  },
  {
    id: 'demo-session-5',
    user_id: AGENT_3,
    project_name: 'NovaRetail',
    start_time: isoDateTime(0, 10),
    end_time: null,
    duration_seconds: 2 * 3600,
    status: 'running',
  },
  {
    id: 'demo-session-6',
    user_id: AGENT_4,
    project_name: 'Internal',
    start_time: isoDateTime(0, 9),
    end_time: isoDateTime(0, 17),
    duration_seconds: 8 * 3600,
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
  {
    id: 'demo-log-2',
    user_id: AGENT_2,
    action_type: 'COMPLETE_APPOINTMENT',
    reference_id: 'demo-appt-5',
    metadata: { project: 'Cloudora' },
    created_at: isoDateTime(-1, 15),
  },
  {
    id: 'demo-log-3',
    user_id: AGENT_3,
    action_type: 'START_TRACKER',
    reference_id: null,
    metadata: { project: 'NovaRetail' },
    created_at: isoDateTime(0, 10),
  },
  {
    id: 'demo-log-4',
    user_id: AGENT_4,
    action_type: 'CREATE_APPOINTMENT',
    reference_id: 'demo-appt-7',
    metadata: { project: 'MetricMint' },
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

export const demoEvaluationCriteria: EvaluationCriterion[] = [
  { id: 'crit-1', name: 'Communication', description: 'Clarity and responsiveness with clients and team.', sort_order: 0 },
  { id: 'crit-2', name: 'Task Completion', description: 'Finishes assigned work on time.', sort_order: 1 },
  { id: 'crit-3', name: 'Reliability', description: 'Shows up and follows through consistently.', sort_order: 2 },
];

export const demoEvaluations: Evaluation[] = [
  {
    id: 'demo-eval-1',
    agent_id: DEMO_USER_ID,
    evaluator_id: DEMO_USER_ID,
    evaluation_date: isoDate(-7),
    notes: 'Strong week overall, kept up with client follow-ups.',
    visible_to_agent: true,
    created_at: isoDateTime(-7, 15),
  },
  {
    id: 'demo-eval-2',
    agent_id: AGENT_2,
    evaluator_id: DEMO_USER_ID,
    evaluation_date: isoDate(-5),
    notes: 'Great client rapport on the Cloudora account.',
    visible_to_agent: true,
    created_at: isoDateTime(-5, 12),
  },
  {
    id: 'demo-eval-3',
    agent_id: AGENT_3,
    evaluator_id: AGENT_4,
    evaluation_date: isoDate(-3),
    notes: 'Missed the NovaRetail renewal call — following up on process.',
    visible_to_agent: false,
    created_at: isoDateTime(-3, 16),
  },
];

export const demoEvaluationScores: EvaluationScore[] = [
  { id: 'demo-score-1', evaluation_id: 'demo-eval-1', criterion_id: 'crit-1', rating: 4, notes: null },
  { id: 'demo-score-2', evaluation_id: 'demo-eval-1', criterion_id: 'crit-2', rating: 5, notes: null },
  { id: 'demo-score-3', evaluation_id: 'demo-eval-1', criterion_id: 'crit-3', rating: 4, notes: 'One late day.' },
  { id: 'demo-score-4', evaluation_id: 'demo-eval-2', criterion_id: 'crit-1', rating: 5, notes: null },
  { id: 'demo-score-5', evaluation_id: 'demo-eval-2', criterion_id: 'crit-2', rating: 4, notes: null },
  { id: 'demo-score-6', evaluation_id: 'demo-eval-3', criterion_id: 'crit-3', rating: 2, notes: 'No-show on a scheduled call.' },
];
