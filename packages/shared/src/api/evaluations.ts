import { getSupabase } from '../supabaseClient';

// Admin-managed evaluation criteria (e.g. "Communication", "Reliability").

export async function listEvaluationCriteria() {
  return getSupabase().from('evaluation_criteria').select('*').order('sort_order', { ascending: true });
}

export async function addEvaluationCriterion(name: string, description?: string) {
  return getSupabase()
    .from('evaluation_criteria')
    .insert({ name: name.trim(), description: description?.trim() || null });
}

export async function deleteEvaluationCriterion(id: string) {
  return getSupabase().from('evaluation_criteria').delete().eq('id', id);
}

// Evaluations — admin/manager create and view all; agent can view their own
// only where visible_to_agent = true (enforced by RLS, not just UI).

export interface NewEvaluationInput {
  agentId: string;
  evaluatorId: string;
  evaluationDate: string; // YYYY-MM-DD
  notes: string;
  visibleToAgent: boolean;
  scores: Array<{ criterionId: string; rating: number | null; notes: string }>;
}

export async function createEvaluation(input: NewEvaluationInput) {
  const { data: evalRow, error } = await getSupabase()
    .from('evaluations')
    .insert({
      agent_id: input.agentId,
      evaluator_id: input.evaluatorId,
      evaluation_date: input.evaluationDate,
      notes: input.notes || null,
      visible_to_agent: input.visibleToAgent,
    })
    .select()
    .single();

  if (error || !evalRow) return { data: null, error };

  if (input.scores.length) {
    const { error: scoreErr } = await getSupabase()
      .from('evaluation_scores')
      .insert(
        input.scores.map((s) => ({
          evaluation_id: evalRow.id,
          criterion_id: s.criterionId,
          rating: s.rating,
          notes: s.notes || null,
        }))
      );
    if (scoreErr) return { data: evalRow, error: scoreErr };
  }

  return { data: evalRow, error: null };
}

export async function updateEvaluation(
  id: string,
  updates: { notes?: string; visibleToAgent?: boolean; evaluationDate?: string }
) {
  return getSupabase()
    .from('evaluations')
    .update({
      ...(updates.notes !== undefined ? { notes: updates.notes || null } : {}),
      ...(updates.visibleToAgent !== undefined ? { visible_to_agent: updates.visibleToAgent } : {}),
      ...(updates.evaluationDate !== undefined ? { evaluation_date: updates.evaluationDate } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function deleteEvaluation(id: string) {
  return getSupabase().from('evaluations').delete().eq('id', id);
}

// Admin/manager: every evaluation across all agents.
export async function listAllEvaluations() {
  return getSupabase().from('evaluations').select('*').order('evaluation_date', { ascending: false });
}

// Agent: only their own evaluations that were explicitly shared (also
// enforced server-side by RLS — this filter is for query efficiency, not security).
export async function listMyEvaluations(agentId: string) {
  return getSupabase()
    .from('evaluations')
    .select('*')
    .eq('agent_id', agentId)
    .eq('visible_to_agent', true)
    .order('evaluation_date', { ascending: false });
}

export async function listEvaluationScores(evaluationId: string) {
  return getSupabase().from('evaluation_scores').select('*').eq('evaluation_id', evaluationId);
}

export async function replaceEvaluationScores(
  evaluationId: string,
  scores: Array<{ criterionId: string; rating: number | null; notes: string }>
): Promise<{ error: { message: string } | null }> {
  await getSupabase().from('evaluation_scores').delete().eq('evaluation_id', evaluationId);
  if (!scores.length) return { error: null };
  const { error } = await getSupabase()
    .from('evaluation_scores')
    .insert(
      scores.map((s) => ({
        evaluation_id: evaluationId,
        criterion_id: s.criterionId,
        rating: s.rating,
        notes: s.notes || null,
      }))
    );
  return { error };
}
