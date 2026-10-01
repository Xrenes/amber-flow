import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { listMyEvaluations, listEvaluationScores, listEvaluationCriteria } from '@amber-flow/shared';
import type { Evaluation, EvaluationScore, EvaluationCriterion } from '@amber-flow/shared';
import { colors } from '../../theme/colors';
import { EmptyState, StatGrid, ui } from './reportUi';

function avg(scores: EvaluationScore[]): number | null {
  const rated = scores.filter((s) => s.rating !== null && s.rating !== undefined);
  return rated.length ? rated.reduce((sum, s) => sum + (s.rating as number), 0) / rated.length : null;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Mobile version of desktop My Reports → Evaluations: only reviews the
// manager shared with this agent (enforced by RLS). Ratings have no fixed
// scale, so they're shown as recorded with an average per review.
export default function EvaluationsReport({ userId, refreshKey }: { userId: string; refreshKey: number }) {
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [scores, setScores] = useState<Record<string, EvaluationScore[]>>({});
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [evalRes, critRes] = await Promise.all([listMyEvaluations(userId), listEvaluationCriteria()]);
      const mine = evalRes.data || [];
      const entries = await Promise.all(mine.map(async (e) => [e.id, (await listEvaluationScores(e.id)).data || []] as const));
      if (cancelled) return;
      setEvals(mine);
      if (critRes.data) setCriteria(critRes.data);
      setScores(Object.fromEntries(entries));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  if (loading) return <Text style={ui.muted}>Loading evaluations…</Text>;
  if (!evals.length) return <EmptyState title="No evaluations yet" body="When your manager shares a review with you, it will appear here." />;

  const sorted = [...evals].sort((a, b) => b.evaluation_date.localeCompare(a.evaluation_date));
  const latest = avg(scores[sorted[0].id] || []);
  const prev = sorted[1] ? avg(scores[sorted[1].id] || []) : null;
  const trend = latest !== null && prev !== null ? latest - prev : null;

  return (
    <View>
      <StatGrid
        items={[
          { value: String(evals.length), label: 'Reviews shared' },
          { value: latest === null ? '—' : fmt(latest), label: 'Latest average', color: colors.accent2 },
          {
            value: trend === null ? '—' : `${trend > 0 ? '+' : ''}${fmt(trend)}`,
            label: 'Change from previous',
            color: trend === null ? undefined : trend > 0 ? colors.success : trend < 0 ? colors.danger : undefined,
          },
        ]}
      />

      <View style={styles.list}>
        {sorted.map((e, i) => {
          const s = scores[e.id] || [];
          const a = avg(s);
          const [y, m, d] = e.evaluation_date.split('-').map(Number);
          return (
            <View key={e.id} style={[ui.card, styles.card]}>
              <View style={styles.head}>
                <View style={styles.headText}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>
                      {new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </Text>
                    {i === 0 && <Text style={styles.latest}>Latest</Text>}
                  </View>
                  <Text style={styles.sub}>
                    {s.length} criteri{s.length === 1 ? 'on' : 'a'} rated
                  </Text>
                </View>
                {a !== null && (
                  <View style={styles.avg}>
                    <Text style={styles.avgVal}>{fmt(a)}</Text>
                    <Text style={styles.avgLabel}>average</Text>
                  </View>
                )}
              </View>

              {s.map((sc) => (
                <View key={sc.id} style={styles.score}>
                  <View style={styles.scoreTop}>
                    <Text style={styles.scoreName}>{criteria.find((c) => c.id === sc.criterion_id)?.name || 'Unknown'}</Text>
                    <Text style={styles.scoreVal}>{sc.rating ?? '—'}</Text>
                  </View>
                  {sc.notes ? <Text style={styles.scoreNote}>{sc.notes}</Text> : null}
                </View>
              ))}

              {e.notes ? (
                <View style={styles.notes}>
                  <Text style={styles.notesLabel}>Manager’s notes</Text>
                  <Text style={styles.notesText}>{e.notes}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  latest: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,122,24,0.35)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  sub: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  avg: {
    alignItems: 'center',
    minWidth: 58,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,122,24,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,24,0.25)',
  },
  avgVal: { fontSize: 20, fontWeight: '800', color: colors.accent2 },
  avgLabel: { fontSize: 9, color: colors.textDim },
  score: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreName: { fontSize: 13, color: colors.text, flex: 1 },
  scoreVal: { fontSize: 17, fontWeight: '800', color: colors.accent2 },
  scoreNote: { fontSize: 12, color: colors.textDim, marginTop: 4, lineHeight: 17 },
  notes: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  notesLabel: { fontSize: 12, fontWeight: '600', color: colors.textDim, marginBottom: 4 },
  notesText: { fontSize: 13, color: colors.text, lineHeight: 19 },
});
