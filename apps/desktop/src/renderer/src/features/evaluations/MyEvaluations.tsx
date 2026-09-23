import React, { useEffect, useState } from 'react';
import { listMyEvaluations, listEvaluationScores, listEvaluationCriteria } from '@amber-flow/shared';
import type { Evaluation, EvaluationScore, EvaluationCriterion } from '@amber-flow/shared';
import { isDemoMode, demoEvaluations, demoEvaluationScores, demoEvaluationCriteria } from '../../demo/demoData';
import styles from './MyEvaluations.module.css';

// Agent-facing view of evaluations admin has explicitly shared with them
// (visible_to_agent = true) — enforced server-side by RLS, this component
// only ever asks for "my" evaluations, never all of them.
export default function MyEvaluations({ userId }: { userId: string }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [scoresByEval, setScoresByEval] = useState<Record<string, EvaluationScore[]>>({});
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function load() {
      if (isDemoMode()) {
        const mine = demoEvaluations.filter((e) => e.agent_id === userId && e.visible_to_agent);
        setEvaluations(mine);
        setCriteria(demoEvaluationCriteria);
        setScoresByEval(
          demoEvaluationScores.reduce<Record<string, EvaluationScore[]>>((acc, s) => {
            (acc[s.evaluation_id] ||= []).push(s);
            return acc;
          }, {})
        );
        setLoading(false);
        return;
      }
      const [evalRes, critRes] = await Promise.all([listMyEvaluations(userId), listEvaluationCriteria()]);
      const mine = evalRes.data || [];
      setEvaluations(mine);
      if (critRes.data) setCriteria(critRes.data);
      if (mine.length) {
        const entries = await Promise.all(
          mine.map(async (e) => [e.id, (await listEvaluationScores(e.id)).data || []] as const)
        );
        setScoresByEval(Object.fromEntries(entries));
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  if (loading || !evaluations.length) return null;

  return (
    <section className={styles.section}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <span>
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V10M18 20V4M6 20v-4" />
          </svg>
          My Evaluations ({evaluations.length})
        </span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className={styles.list}>
          {evaluations.map((e) => {
            const scores = scoresByEval[e.id] || [];
            return (
              <div key={e.id} className={styles.card}>
                <div className={styles.date}>{e.evaluation_date}</div>
                {scores.length > 0 && (
                  <div className={styles.scoreGrid}>
                    {scores.map((s) => {
                      const criterion = criteria.find((c) => c.id === s.criterion_id);
                      return (
                        <div key={s.id} className={styles.scoreItem}>
                          <span>{criterion?.name || 'Unknown'}</span>
                          <strong>{s.rating ?? '—'}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}
                {e.notes && <p className={styles.notes}>{e.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
