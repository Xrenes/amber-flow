import {
  appointmentLogMetadata,
  getSupabase,
  insertActivityLogs,
  upsertAppointments,
  upsertTimeSessions,
  upsertAgentGoalsBulk,
  type AppointmentStatus,
  type ImportExportDataType,
  type ResolvedImportRow,
  type ShowStatus,
} from '@amber-flow/shared';

export interface ImportResult {
  error: { message: string } | null;
  created: number;
  updated: number;
}

// id -> user_id for the rows of `table` that already exist among `ids`, so a
// re-imported row keeps whoever originally saved it ("Booked by").
async function existingOwners(table: 'appointments' | 'time_sessions', ids: string[]) {
  const owners = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await getSupabase().from(table).select('id, user_id').in('id', ids.slice(i, i + 200));
    if (error) return { owners, error };
    (data || []).forEach((r: { id: string; user_id: string }) => owners.set(r.id, r.user_id));
  }
  return { owners, error: null };
}

// The same ID twice in one sheet would make the bulk upsert fail outright,
// so the last row for an ID wins (as if the sheet were applied top to bottom).
function lastRowPerId(rows: ResolvedImportRow[]): ResolvedImportRow[] {
  const lastIndex = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.values.id) lastIndex.set(r.values.id as string, i);
  });
  return rows.filter((r, i) => !r.values.id || lastIndex.get(r.values.id as string) === i);
}

// Converts resolved rows (from resolveImportRow, values keyed by the app's
// own field names + __agentUserId for agent fields) into each table's
// bulk-upsert input, then writes them. A row whose ID already exists is
// updated in place (keeping its original saver and booked time); every other
// row is added. Only ever called with rows that passed validation.
export async function executeImport(
  dataType: ImportExportDataType,
  rows: ResolvedImportRow[],
  importerId: string
): Promise<ImportResult> {
  if (dataType !== 'agentGoals') rows = lastRowPerId(rows);
  switch (dataType) {
    case 'appointments': {
      const ids = rows.map((r) => r.values.id as string | null).filter((id): id is string => !!id);
      const { owners, error: lookupErr } = await existingOwners('appointments', ids);
      if (lookupErr) return { error: lookupErr, created: 0, updated: 0 };

      const inputs = rows.map((r) => {
        const id = (r.values.id as string | null) || crypto.randomUUID();
        return {
          id,
          user_id: owners.get(id) || (r.values.__agentUserId as string | null) || importerId,
          title: r.values.title as string,
          description: (r.values.description as string) || '',
          scheduled_time: r.values.scheduled_time as string,
          timezone: (r.values.timezone as string) || null,
          reminder_minutes: (r.values.reminder_minutes as number) ?? 15,
          status: ((r.values.status as AppointmentStatus) || 'pending') as AppointmentStatus,
          show_status: (r.values.show_status as ShowStatus | null) || null,
          account_name: (r.values.account_name as string) || null,
          agent_name: (r.values.agent_name as string) || null,
          project_name: r.values.project_name as string,
          created_at: (r.values.created_at as string) || undefined,
        };
      });
      const { error } = await upsertAppointments(inputs);
      if (error) return { error, created: 0, updated: 0 };

      await insertActivityLogs(
        inputs.map((a) => ({
          userId: importerId,
          actionType: owners.has(a.id) ? 'IMPORT_UPDATE_APPOINTMENT' : 'IMPORT_APPOINTMENT',
          metadata: appointmentLogMetadata(a),
        }))
      );
      const updated = inputs.filter((a) => owners.has(a.id)).length;
      return { error: null, created: inputs.length - updated, updated };
    }
    case 'timeSessions': {
      const ids = rows.map((r) => r.values.id as string | null).filter((id): id is string => !!id);
      const { owners, error: lookupErr } = await existingOwners('time_sessions', ids);
      if (lookupErr) return { error: lookupErr, created: 0, updated: 0 };

      const inputs = rows.map((r) => {
        const id = (r.values.id as string | null) || crypto.randomUUID();
        const start = r.values.start_time as string;
        const end = (r.values.end_time as string) || null;
        return {
          id,
          user_id: owners.get(id) || (r.values.__agentUserId as string | null) || importerId,
          project_name: r.values.project_name as string,
          start_time: start,
          end_time: end,
          duration_seconds:
            (r.values.duration_seconds as number) ??
            (end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : null),
          agent_name: (r.values.agent_name as string) || null,
        };
      });
      const { error } = await upsertTimeSessions(inputs);
      if (error) return { error, created: 0, updated: 0 };

      await insertActivityLogs(
        inputs.map((s) => ({
          userId: importerId,
          actionType: owners.has(s.id) ? 'IMPORT_UPDATE_TIME_SESSION' : 'IMPORT_TIME_SESSION',
          metadata: {
            sessionId: s.id,
            bookedBy: s.user_id,
            projectName: s.project_name,
            agentName: s.agent_name,
            startTime: s.start_time,
            endTime: s.end_time,
            durationSeconds: s.duration_seconds,
          },
        }))
      );
      const updated = inputs.filter((s) => owners.has(s.id)).length;
      return { error: null, created: inputs.length - updated, updated };
    }
    case 'agentGoals': {
      const inputs = rows.map((r) => ({
        userId: (r.values.__agentUserId as string) || null,
        campaignName: (r.values.campaign_name as string) || null,
        dailyAppointmentGoal: r.values.daily_appointment_goal as number,
        dailyShowGoal: r.values.daily_show_goal as number,
      }));
      const { error } = await upsertAgentGoalsBulk(inputs);
      return { error, created: error ? 0 : inputs.length, updated: 0 };
    }
  }
}
