import React, { useEffect, useState } from 'react';
import { listMyEvaluations, listEvaluationScores, listEvaluationCriteria } from '@amber-flow/shared';
import type { Evaluation, EvaluationScore, EvaluationCriterion } from '@amber-flow/shared';
import { isDemoMode, demoEvaluations, demoEvaluationScores, demoEvaluationCriteria } from '../../demo/demoData';
import styles from './MyEvaluations.module.css';

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function average(scores: EvaluationScore[]): number | null {
  const rated = scores.filter((s) => s.rating !== null && s.rating !== undefined);
  if (!rated.length) return null;
  return rated.reduce((sum, s) => sum + (s.rating as number), 0) / rated.length;
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Agent-facing panel of evaluations admin has explicitly shared with them
// (visible_to_agent = true) — enforced server-side by RLS, this component
// only ever asks for "my" evaluations, never all of them. Lives as a tab
// panel in the agent's "Reports" page (MyReportsPage). Ratings aren't on a
// fixed scale, so they're shown as recorded, with the average per review.
export default function MyEvaluations({ userId }: { userId: string }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [scoresByEval, setScoresByEval] = useState<Record<string, EvaluationScore[]>>({});
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <p className={styles.hint}>Loading evaluations…</p>;
  if (!evaluations.length) {
    return (
      <div className={styles.emptyState}>
        <h3>No evaluations yet</h3>
        <p>When your manager shares a review with you, it will appear here.</p>
      </div>
    );
  }

  const sorted = [...evaluations].sort((a, b) => b.evaluation_date.localeCompare(a.evaluation_date));
  const latestAvg = average(scoresByEval[sorted[0].id] || []);
  const prevAvg = sorted[1] ? average(scoresByEval[sorted[1].id] || []) : null;
  const trend = latestAvg !== null && prevAvg !== null ? latestAvg - prevAvg : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{evaluations.length}</span>
          <span className={styles.summaryLabel}>Reviews shared with you</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={`${styles.summaryValue} ${styles.accent}`}>{latestAvg === null ? '—' : fmtScore(latestAvg)}</span>
          <span className={styles.summaryLabel}>Latest average score</span>
        </div>
        <div className={styles.summaryItem}>
          <span
            className={`${styles.summaryValue} ${trend === null ? '' : trend > 0 ? styles.up : trend < 0 ? styles.down : ''}`}
          >
            {trend === null ? '—' : `${trend > 0 ? '+' : ''}${fmtScore(trend)}`}
          </span>
          <span className={styles.summaryLabel}>Change from previous review</span>
        </div>
      </div>

      {sorted.map((e, idx) => {
        const scores = scoresByEval[e.id] || [];
        const avg = average(scores);
        return (
          <article key={e.id} className={styles.card}>
            <header className={styles.cardHead}>
              <div>
                <div className={styles.cardTitle}>
                  {fmtDate(e.evaluation_date)}
                  {idx === 0 && <span className={styles.latest}>Latest</span>}
                </div>
                <div className={styles.cardSub}>
                  {scores.length} criteri{scores.length === 1 ? 'on' : 'a'} rated
                </div>
              </div>
              {avg !== null && (
                <div className={styles.avg}>
                  <span className={styles.avgValue}>{fmtScore(avg)}</span>
                  <span className={styles.avgLabel}>average</span>
                </div>
              )}
            </header>

            {scores.length > 0 && (
              <div className={styles.scoreGrid}>
                {scores.map((s) => {
                  const criterion = criteria.find((c) => c.id === s.criterion_id);
                  return (
                    <div key={s.id} className={styles.scoreItem}>
                      <div className={styles.scoreTop}>
                        <span className={styles.scoreName}>{criterion?.name || 'Unknown'}</span>
                        <strong className={styles.scoreValue}>{s.rating ?? '—'}</strong>
                      </div>
                      {s.notes && <p className={styles.scoreNote}>{s.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {e.notes && (
              <div className={styles.notes}>
                <div className={styles.notesLabel}>Manager’s notes</div>
                <p>{e.notes}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
