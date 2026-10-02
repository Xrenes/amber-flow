import * as XLSX from 'xlsx';
import type { Appointment, TimeSession, AgentGoal, Profile, ImportExportDataType } from '@amber-flow/shared';
import { FIELD_SCHEMAS, DATA_TYPE_LABELS, utcToWallTime } from '@amber-flow/shared';
import { browserTimezone } from '../appointments/tzUtil';

// Converts a data type's rows into the human-readable column shape defined
// by FIELD_SCHEMAS (packages/shared/src/dataImportExport.ts) — the same
// schema the import mapping UI uses, so a round-tripped export→edit→import
// lines up column-for-column with no remapping needed.

function appointmentToRow(a: Appointment, agentNameById: Record<string, string>): Record<string, unknown> {
  // Times are written on the appointment's own clock, with its timezone in
  // the Timezone column — the import reads them back the same way.
  const tz = a.timezone || browserTimezone();
  return {
    ID: a.id,
    Title: a.title,
    Description: a.description ?? '',
    'Scheduled Time': a.scheduled_time ? utcToWallTime(a.scheduled_time, tz) : '',
    Timezone: tz,
    'Reminder (minutes before)': a.reminder_minutes,
    Status: a.status,
    'Show Status': a.show_status ?? '',
    Account: a.account_name ?? '',
    Campaign: a.project_name ?? '',
    // The agent the appointment is for, the same attribution Reports uses.
    Agent: a.agent_name || agentNameById[a.user_id] || '',
    'Booked At': a.created_at ? utcToWallTime(a.created_at, tz) : '',
  };
}

function timeSessionToRow(s: TimeSession, agentNameById: Record<string, string>): Record<string, unknown> {
  // Sessions have no timezone of their own: written (and read back) on this
  // computer's clock.
  const tz = browserTimezone();
  return {
    ID: s.id,
    Campaign: s.project_name,
    'Start Time': s.start_time ? utcToWallTime(s.start_time, tz) : '',
    'End Time': s.end_time ? utcToWallTime(s.end_time, tz) : '',
    'Duration (seconds)': s.duration_seconds ?? '',
    Agent: s.agent_name || agentNameById[s.user_id] || '',
  };
}

function agentGoalToRow(g: AgentGoal, agentNameById: Record<string, string>): Record<string, unknown> {
  return {
    'Agent (blank = everyone)': g.user_id ? agentNameById[g.user_id] || '' : '',
    'Campaign (blank = any)': g.campaign_name ?? '',
    'Daily Appointment Goal': g.daily_appointment_goal,
    'Daily Show Goal': g.daily_show_goal,
  };
}

export interface ExportSourceData {
  appointments: Appointment[];
  timeSessions: TimeSession[];
  agentGoals: AgentGoal[];
  profiles: Profile[];
}

export function exportDataType(dataType: ImportExportDataType, data: ExportSourceData) {
  const agentNameById: Record<string, string> = {};
  data.profiles.forEach((p) => {
    agentNameById[p.id] = p.name || 'Unknown';
  });

  let rows: Record<string, unknown>[];
  switch (dataType) {
    case 'appointments':
      rows = data.appointments.map((a) => appointmentToRow(a, agentNameById));
      break;
    case 'timeSessions':
      rows = data.timeSessions.map((s) => timeSessionToRow(s, agentNameById));
      break;
    case 'agentGoals':
      rows = data.agentGoals.map((g) => agentGoalToRow(g, agentNameById));
      break;
  }

  // At least the header row even with zero data, so the downloaded file is
  // a usable import template rather than an empty/confusing workbook.
  const headers = FIELD_SCHEMAS[dataType].map((f) => f.label);
  const worksheet =
    rows.length > 0 ? XLSX.utils.json_to_sheet(rows, { header: headers }) : XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, DATA_TYPE_LABELS[dataType].slice(0, 31));

  const filename = `amber-flow-${dataType}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
