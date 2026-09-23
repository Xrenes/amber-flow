import { useCallback, useEffect, useState } from 'react';
import {
  listEvaluationCriteria,
  addEvaluationCriterion,
  deleteEvaluationCriterion,
  listAllEvaluations,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  listEvaluationScores,
  replaceEvaluationScores,
  type NewEvaluationInput,
} from '@amber-flow/shared';
import type { EvaluationCriterion, Evaluation, EvaluationScore } from '@amber-flow/shared';
import {
  isDemoMode,
  demoEvaluationCriteria,
  demoEvaluations,
  demoEvaluationScores,
} from '../../demo/demoData';

export function useEvaluations() {
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>(isDemoMode() ? demoEvaluationCriteria : []);
  const [evaluations, setEvaluations] = useState<Evaluation[]>(isDemoMode() ? demoEvaluations : []);
  const [scoresByEval, setScoresByEval] = useState<Record<string, EvaluationScore[]>>(
    isDemoMode()
      ? demoEvaluationScores.reduce<Record<string, EvaluationScore[]>>((acc, s) => {
          (acc[s.evaluation_id] ||= []).push(s);
          return acc;
        }, {})
      : {}
  );
  const [loading, setLoading] = useState(!isDemoMode());

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [critRes, evalRes] = await Promise.all([listEvaluationCriteria(), listAllEvaluations()]);
    if (critRes.data) setCriteria(critRes.data);
    if (evalRes.data) setEvaluations(evalRes.data);
    if (evalRes.data?.length) {
      const scoreEntries = await Promise.all(
        evalRes.data.map(async (e) => [e.id, (await listEvaluationScores(e.id)).data || []] as const)
      );
      setScoresByEval(Object.fromEntries(scoreEntries));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addCriterion = useCallback(
    async (name: string, description?: string) => {
      if (isDemoMode()) {
        setCriteria((prev) => [...prev, { id: `demo-crit-${Date.now()}`, name, description: description || null, sort_order: prev.length }]);
        return;
      }
      await addEvaluationCriterion(name, description);
      await refresh();
    },
    [refresh]
  );

  const removeCriterion = useCallback(
    async (id: string) => {
      if (isDemoMode()) {
        setCriteria((prev) => prev.filter((c) => c.id !== id));
        return;
      }
      await deleteEvaluationCriterion(id);
      await refresh();
    },
    [refresh]
  );

  const submitEvaluation = useCallback(
    async (input: NewEvaluationInput) => {
      if (isDemoMode()) {
        const id = `demo-eval-${Date.now()}`;
        setEvaluations((prev) => [
          {
            id,
            agent_id: input.agentId,
            evaluator_id: input.evaluatorId,
            evaluation_date: input.evaluationDate,
            notes: input.notes || null,
            visible_to_agent: input.visibleToAgent,
          },
          ...prev,
        ]);
        setScoresByEval((prev) => ({
          ...prev,
          [id]: input.scores.map((s, i) => ({
            id: `demo-score-${Date.now()}-${i}`,
            evaluation_id: id,
            criterion_id: s.criterionId,
            rating: s.rating,
            notes: s.notes || null,
          })),
        }));
        return { error: null };
      }
      const { error } = await createEvaluation(input);
      if (!error) await refresh();
      return { error };
    },
    [refresh]
  );

  const editEvaluation = useCallback(
    async (
      id: string,
      updates: { notes?: string; visibleToAgent?: boolean; evaluationDate?: string },
      scores?: Array<{ criterionId: string; rating: number | null; notes: string }>
    ) => {
      if (isDemoMode()) {
        setEvaluations((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...(updates.notes !== undefined ? { notes: updates.notes || null } : {}),
                  ...(updates.visibleToAgent !== undefined ? { visible_to_agent: updates.visibleToAgent } : {}),
                  ...(updates.evaluationDate !== undefined ? { evaluation_date: updates.evaluationDate } : {}),
                }
              : e
          )
        );
        if (scores) {
          setScoresByEval((prev) => ({
            ...prev,
            [id]: scores.map((s, i) => ({
              id: `demo-score-${Date.now()}-${i}`,
              evaluation_id: id,
              criterion_id: s.criterionId,
              rating: s.rating,
              notes: s.notes || null,
            })),
          }));
        }
        return;
      }
      await updateEvaluation(id, updates);
      if (scores) await replaceEvaluationScores(id, scores);
      await refresh();
    },
    [refresh]
  );

  const removeEvaluation = useCallback(
    async (id: string) => {
      if (isDemoMode()) {
        setEvaluations((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      await deleteEvaluation(id);
      await refresh();
    },
    [refresh]
  );

  return {
    criteria,
    evaluations,
    scoresByEval,
    loading,
    addCriterion,
    removeCriterion,
    submitEvaluation,
    editEvaluation,
    removeEvaluation,
    refresh,
  };
}
