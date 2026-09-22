import { getSupabase } from '../supabaseClient';

// --- Admin / manager (admin.js) ----------------------------------------

// All profiles (agents/managers/admins), ordered by name (admin dashboard
// "Overview" agent cards + name lookups used across every admin tab).
// RLS policy restricts this to admin/manager roles (see profiles_manager_view).
export async function listAllProfiles() {
  return getSupabase().from('profiles').select('*').order('name');
}
