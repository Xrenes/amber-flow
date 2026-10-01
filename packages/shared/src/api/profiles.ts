import { getSupabase } from '../supabaseClient';

// --- Admin / manager (admin.js) ----------------------------------------

// All profiles (agents/managers/admins), ordered by name (admin dashboard
// "Overview" agent cards + name lookups used across every admin tab).
// RLS policy restricts this to admin/manager roles (see profiles_manager_view).
export async function listAllProfiles() {
  return getSupabase().from('profiles').select('*').order('name');
}

// Lightweight team directory (id/name only) — any signed-in user can read
// this (see profiles_team_directory_read), used to populate an "assign to"
// dropdown, e.g. the Appointment modal's Agent field.
export async function listTeamDirectory() {
  return getSupabase().from('profiles').select('id, name').order('name');
}

// Settings → Display name: renames the signed-in user's own profile, which
// is what every Agent dropdown, Admin list and teammate's screen shows.
// RLS allows a user to update their own row (but not their role).
export async function updateMyProfileName(userId: string, name: string) {
  return getSupabase().from('profiles').update({ name }).eq('id', userId);
}
