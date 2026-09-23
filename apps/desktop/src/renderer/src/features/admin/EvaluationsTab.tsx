import React, { useMemo, useState } from 'react';
import type { AdminData } from './useAdminData';
import { useEvaluations } from './useEvaluations';
import { useAuth } from '../../auth/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import sharedStyles from './AdminShared.module.css';
import styles from './EvaluationsTab.module.css';

interface Props {
  data: AdminData;
}

function CriteriaManager({
  criteria,
  onAdd,
  onRemove,
}: {
  criteria: ReturnType<typeof useEvaluations>['criteria'];
  onAdd: (name: string, description?: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name, description);
    setName('');
    setDescription('');
  }

  return (
    <div className={styles.criteriaCard}>
      <button type="button" className={styles.criteriaToggle} onClick={() => setOpen((v) => !v)}>
        <span>Evaluation Criteria ({criteria.length})</span>
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
        <div className={styles.criteriaBody}>
          <p className={styles.hint}>
            Define the categories used to evaluate agents. More can be added any time.
          </p>
          <ul className={styles.criteriaList}>
            {criteria.map((c) => (
              <li key={c.id} className={styles.criteriaItem}>
                <div>
                  <div className={styles.criteriaName}>{c.name}</div>
                  {c.description && <div className={styles.criteriaDesc}>{c.description}</div>}
                </div>
                <button type="button" className={styles.removeBtn} onClick={() => onRemove(c.id)}>
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <form className={styles.addCriterionForm} onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Criterion name (e.g. Communication)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button type="submit" className={styles.addBtn} disabled={!name.trim()}>
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Admin-only tab: manage evaluation criteria, submit scored evaluations per
// agent, and browse past ones. Ratings are recorded as entered — no fixed
// scale enforced yet. Each evaluation has a visible_to_agent toggle so admin
// decides case by case whether the evaluated agent can see it.
export default function EvaluationsTab({ data }: Props) {
  const { profiles } = data;
  const { user } = useAuth();
  const ev = useEvaluations();

  const [formOpen, setFormOpen] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [evalDate, setEvalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [visibleToAgent, setVisibleToAgent] = useState(false);
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [criterionNotes, setCriterionNotes] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => {
      map[p.id] = p.name || 'Unknown';
    });
    return map;
  }, [profiles]);

  function openForm() {
    setAgentId(profiles[0]?.id || '');
    setEvalDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setVisibleToAgent(false);
    setRatings({});
    setCriterionNotes({});
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || !user) return;
    const scores = ev.criteria.map((c) => ({
      criterionId: c.id,
      rating: ratings[c.id] ? Number(ratings[c.id]) : null,
      notes: criterionNotes[c.id] || '',
    }));
    await ev.submitEvaluation({
      agentId,
      evaluatorId: user.id,
      evaluationDate: evalDate,
      notes,
      visibleToAgent,
      scores,
    });
    setFormOpen(false);
  }

  async function confirmDelete() {
    if (deletingId) await ev.removeEvaluation(deletingId);
    setDeletingId(null);
  }

  return (
    <div>
      <CriteriaManager criteria={ev.criteria} onAdd={ev.addCriterion} onRemove={ev.removeCriterion} />

      <div className={styles.toolbar}>
        <p className={styles.hint}>Evaluations recorded for your team.</p>
        <button type="button" className={styles.newBtn} onClick={openForm} disabled={!ev.criteria.length}>
          + New Evaluation
        </button>
      </div>
      {!ev.criteria.length && <p className={styles.hint}>Add at least one criterion above before evaluating.</p>}

      {ev.loading ? (
        <p className={sharedStyles.feedPlaceholder}>Loading…</p>
      ) : !ev.evaluations.length ? (
        <p className={sharedStyles.feedPlaceholder}>No evaluations recorded yet.</p>
      ) : (
        <ul className={styles.evalList}>
          {ev.evaluations.map((e) => {
            const scores = ev.scoresByEval[e.id] || [];
            return (
              <li key={e.id} className={styles.evalItem}>
                <div className={styles.evalHeader}>
                  <div>
                    <div className={styles.evalAgent}>{profileMap[e.agent_id] || 'Unknown agent'}</div>
                    <div className={styles.evalDate}>{e.evaluation_date}</div>
                  </div>
                  <div className={styles.evalHeaderRight}>
                    <span className={`${styles.visibilityBadge} ${e.visible_to_agent ? styles.shared : ''}`}>
                      {e.visible_to_agent ? 'Shared with agent' : 'Internal only'}
                    </span>
                    <button type="button" className={styles.removeBtn} onClick={() => setDeletingId(e.id)}>
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
                {scores.length > 0 && (
                  <div className={styles.scoreGrid}>
                    {scores.map((s) => {
                      const criterion = ev.criteria.find((c) => c.id === s.criterion_id);
                      return (
                        <div key={s.id} className={styles.scoreItem}>
                          <span className={styles.scoreCriterion}>{criterion?.name || 'Unknown'}</span>
                          <span className={styles.scoreValue}>{s.rating ?? '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {e.notes && <p className={styles.evalNotes}>{e.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}>
          <form className={styles.modal} onSubmit={handleSubmit}>
            <h3 className={styles.modalTitle}>New Evaluation</h3>

            <label className={styles.field}>
              <span>Agent</span>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Unknown'}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Date</span>
              <input type="date" value={evalDate} onChange={(e) => setEvalDate(e.target.value)} />
            </label>

            <div className={styles.criteriaScoring}>
              {ev.criteria.map((c) => (
                <div key={c.id} className={styles.scoringRow}>
                  <div className={styles.scoringLabel}>
                    <span>{c.name}</span>
                    {c.description && <small>{c.description}</small>}
                  </div>
                  <input
                    type="number"
                    className={styles.ratingInput}
                    placeholder="Rating"
                    value={ratings[c.id] || ''}
                    onChange={(e) => setRatings((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                  <input
                    type="text"
                    className={styles.scoringNoteInput}
                    placeholder="Note (optional)"
                    value={criterionNotes[c.id] || ''}
                    onChange={(e) => setCriterionNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <label className={styles.field}>
              <span>Overall notes</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={visibleToAgent}
                onChange={(e) => setVisibleToAgent(e.target.checked)}
              />
              <span>Share this evaluation with the agent</span>
            </label>

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.saveBtn}>
                Save Evaluation
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete evaluation"
          message="This evaluation and its scores will be permanently removed."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
