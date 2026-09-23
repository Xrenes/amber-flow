import { getSupabase } from '../supabaseClient';
import type { TaskFieldName, TaskFieldMode } from '../types';

// Admin-managed dropdown values for the Account/Campaign task fields.
// Read is open to everyone (needed to populate the New Task modal); writes
// are restricted to admin/manager by RLS (see migrations/001_*.sql).

export async function listTaskFieldOptions(field: TaskFieldName) {
  return getSupabase()
    .from('task_field_options')
    .select('*')
    .eq('field', field)
    .order('value', { ascending: true });
}

export async function addTaskFieldOption(field: TaskFieldName, value: string) {
  return getSupabase().from('task_field_options').insert({ field, value: value.trim() });
}

export async function deleteTaskFieldOption(id: string) {
  return getSupabase().from('task_field_options').delete().eq('id', id);
}

// Per-field mode (dropdown vs free text), admin-toggleable.

export async function getTaskFieldConfig() {
  return getSupabase().from('task_field_config').select('*');
}

export async function setTaskFieldMode(field: TaskFieldName, mode: TaskFieldMode) {
  return getSupabase().from('task_field_config').upsert({ field, mode }, { onConflict: 'field' });
}
