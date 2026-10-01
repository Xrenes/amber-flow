import * as XLSX from 'xlsx';
import type { Appointment, TimeSession, AgentGoal, Profile, ImportExportDataType } from '@amber-flow/shared';
import { FIELD_SCHEMAS, DATA_TYPE_LABELS } from '@amber-flow/shared';

// Converts a data type's rows into the human-readable column shape defined
// by FIELD_SCHEMAS (packages/shared/src/dataImportExport.ts) — the same
// schema the import mapping UI uses, so a round-tripped export→edit→import
// lines up column-for-column with no remapping needed.

function appointmentToRow(a: Appointment, agentNameById: Record<string, string>): Record<string, unknown> {
  return {
    Title: a.title,
    Description: a.description ?? '',
    'Scheduled Time': a.scheduled_time ? new Date(a.scheduled_time).toISOString().slice(0, 16).replace('T', ' ') : '',
    'Reminder (minutes before)': a.reminder_minutes,
    Status: a.status,
    'Show Status': a.show_status ?? '',
    Account: a.account_name ?? '',
    Campaign: a.project_name ?? '',
    Agent: agentNameById[a.user_id] || '',
  };
}

function timeSessionToRow(s: TimeSession, agentNameById: Record<string, string>): Record<string, unknown> {
  return {
    Campaign: s.project_name,
    'Start Time': s.start_time ? new Date(s.start_time).toISOString().slice(0, 16).replace('T', ' ') : '',
    'End Time': s.end_time ? new Date(s.end_time).toISOString().slice(0, 16).replace('T', ' ') : '',
    'Duration (seconds)': s.duration_seconds ?? '',
    Agent: agentNameById[s.user_id] || '',
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
