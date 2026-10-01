import {
  upsertAppointments,
  upsertTimeSessions,
  upsertAgentGoalsBulk,
  type ImportExportDataType,
  type ResolvedImportRow,
} from '@amber-flow/shared';

// Converts resolved rows (from resolveImportRow, values keyed by the app's
// own field names + __agentUserId for agent-ref fields) into each table's
// specific typed bulk-upsert input, then writes them. Only ever called with
// rows that already passed validation (error === null) — the caller filters
// those out before this runs.
export async function executeImport(dataType: ImportExportDataType, rows: ResolvedImportRow[]) {
  switch (dataType) {
    case 'appointments': {
      const inputs = rows.map((r) => ({
        id: crypto.randomUUID(),
        user_id: r.values.__agentUserId as string,
        title: r.values.title as string,
        description: (r.values.description as string) || null,
        scheduled_time: r.values.scheduled_time as string,
        reminder_minutes: (r.values.reminder_minutes as number) ?? 15,
        status: (r.values.status as 'pending' | 'completed' | 'missed') || 'pending',
        show_status: (r.values.show_status as 'showed' | 'no_show' | 'uncertain' | null) || null,
        account_name: (r.values.account_name as string) || null,
        project_name: r.values.project_name as string,
      }));
      return upsertAppointments(inputs);
    }
    case 'timeSessions': {
      const inputs = rows.map((r) => ({
        id: crypto.randomUUID(),
        user_id: r.values.__agentUserId as string,
        project_name: r.values.project_name as string,
        start_time: r.values.start_time as string,
        end_time: (r.values.end_time as string) || null,
        duration_seconds:
          (r.values.duration_seconds as number) ??
          (r.values.end_time
            ? Math.round(
                (new Date(r.values.end_time as string).getTime() - new Date(r.values.start_time as string).getTime()) / 1000
              )
            : null),
      }));
      return upsertTimeSessions(inputs);
    }
    case 'agentGoals': {
      const inputs = rows.map((r) => ({
        userId: (r.values.__agentUserId as string) || null,
        campaignName: (r.values.campaign_name as string) || null,
        dailyAppointmentGoal: r.values.daily_appointment_goal as number,
        dailyShowGoal: r.values.daily_show_goal as number,
      }));
      return upsertAgentGoalsBulk(inputs);
    }
  }
}
