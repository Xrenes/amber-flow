import React, { useMemo, useState } from 'react';
import { upsertAgentGoal, deleteAgentGoal } from '@amber-flow/shared';
import type { AgentGoal } from '@amber-flow/shared';
import { useTaskFieldOptions } from '../appointments/useTaskFieldOptions';
import { isDemoMode } from '../../demo/demoData';
import type { AdminData } from './useAdminData';
import { useGoalAttainment, type AgentAttainmentRow, type PeriodKey } from './useGoalAttainment';
import sharedStyles from './AdminShared.module.css';
import styles from './GoalAttainmentTab.module.css';

interface Props {
  data: AdminData;
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
};

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

function fmtHours(h: number): string {
  return h.toFixed(1);
}

function fmtAvg(n: number): string {
  return n.toFixed(1);
}

function todayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// New goal/attainment reporting tab — ports the "DialForce" tracking
// spreadsheet's Tracker Setup + Weekly/Monthly/Quarterly Performance sheets.
// Built alongside (not replacing) ProductivityReportsTab per explicit
// instruction to validate this first. Report Date drives all three period
// windows, same as the sheet's single Report Date cell.
export default function GoalAttainmentTab({ data }: Props) {
  const [reportDateStr, setReportDateStr] = useState(() => todayStr(new Date()));
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [goalsOpen, setGoalsOpen] = useState(false);

  const reportDate = useMemo(() => new Date(`${reportDateStr}T12:00:00`), [reportDateStr]);
  const { goals, loading, weekRows, monthRows, quarterRows } = useGoalAttainment(data, reportDate);

  const rows = period === 'week' ? weekRows : period === 'month' ? monthRows : quarterRows;
  const sorted = useMemo(() => [...rows].sort((a, b) => b.appointments - a.appointments), [rows]);

  if (loading && !data.profiles.length) {
    return <p className={sharedStyles.feedPlaceholder}>Loading…</p>;
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.reportDateField}>
          <label htmlFor="goal-report-date">Report Date</label>
          <input
            id="goal-report-date"
            type="date"
            value={reportDateStr}
            onChange={(e) => setReportDateStr(e.target.value)}
          />
        </div>
        <div className={sharedStyles.filterRow} style={{ marginBottom: 0 }}>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`${sharedStyles.chip} ${period === p ? sharedStyles.active : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <button type="button" className={styles.goalsBtn} onClick={() => setGoalsOpen(true)}>
          Manage Goals
        </button>
      </div>

      <p className={styles.hint}>
        Calculated goals use each agent's resolved daily target (global default unless a per-agent or per-campaign
        override applies) × their Active Days in the {PERIOD_LABELS[period].toLowerCase()} window ending on the Report
        Date.
      </p>

      <div className={sharedStyles.tableWrap}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Appointments</th>
              <th>Shows</th>
              <th>Active Days</th>
              <th>Calc App Goal</th>
              <th>Calc Show Goal</th>
              <th>App Attainment</th>
              <th>Show Attainment</th>
              <th>Show Rate</th>
              <th>Hours</th>
              <th>Avg Apps/Day</th>
              <th>Avg Shows/Day</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={13} className={sharedStyles.tableEmpty}>
                  No agents found.
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <AttainmentRow key={r.userId} row={r} />
            ))}
          </tbody>
        </table>
      </div>

      {goalsOpen && (
        <GoalsManagerModal
          goals={goals}
          profiles={data.profiles.filter((p) => p.role === 'agent')}
          onClose={() => setGoalsOpen(false)}
        />
      )}
    </div>
  );
}

function AttainmentRow({ row }: { row: AgentAttainmentRow }) {
  return (
    <tr>
      <td>{row.name}</td>
      <td>{row.appointments}</td>
      <td>{row.shows}</td>
      <td>{row.activeDays}</td>
      <td>{row.calcAppointmentGoal}</td>
      <td>{row.calcShowGoal}</td>
      <td>{fmtPct(row.appAttainmentPct)}</td>
      <td>{fmtPct(row.showAttainmentPct)}</td>
      <td>{fmtPct(row.showRatePct)}</td>
      <td>{fmtHours(row.hours)}</td>
      <td>{fmtAvg(row.avgAppsPerDay)}</td>
      <td>{fmtAvg(row.avgShowsPerDay)}</td>
      <td>
        <span className={`${styles.statusBadge} ${row.meetsGoal ? styles.meets : styles.below}`}>
          {row.meetsGoal ? 'Meets Goal' : 'Below Goal'}
        </span>
      </td>
    </tr>
  );
}

interface GoalsManagerModalProps {
  goals: AgentGoal[];
  profiles: { id: string; name: string }[];
  onClose: () => void;
}

// Global default + per-agent + per-campaign override editor. Each row is one
// agent_goals record; scope is chosen via the Agent/Campaign dropdowns
// (— Everyone — / — Any campaign — map to NULL, i.e. the wildcard).
function GoalsManagerModal({ goals, profiles, onClose }: GoalsManagerModalProps) {
  const campaignField = useTaskFieldOptions('campaign');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [campaignName, setCampaignName] = useState<string>('');
  const [appGoal, setAppGoal] = useState(3);
  const [showGoal, setShowGoal] = useState(2);
  const [saving, setSaving] = useState(false);

  function startNew() {
    setEditingId('new');
    setUserId('');
    setCampaignName('');
    setAppGoal(3);
    setShowGoal(2);
  }

  function startEdit(g: AgentGoal) {
    setEditingId(g.id);
    setUserId(g.user_id || '');
    setCampaignName(g.campaign_name || '');
    setAppGoal(g.daily_appointment_goal);
    setShowGoal(g.daily_show_goal);
  }

  async function handleSave() {
    if (isDemoMode()) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    await upsertAgentGoal({
      id: editingId !== 'new' ? (editingId as string) : undefined,
      userId: userId || null,
      campaignName: campaignName || null,
      dailyAppointmentGoal: appGoal,
      dailyShowGoal: showGoal,
    });
    setSaving(false);
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (isDemoMode()) return;
    await deleteAgentGoal(id);
  }

  function scopeLabel(g: AgentGoal): string {
    const agentPart = g.user_id ? profiles.find((p) => p.id === g.user_id)?.name || 'Unknown agent' : 'Everyone';
    const campaignPart = g.campaign_name || 'Any campaign';
    return `${agentPart} · ${campaignPart}`;
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Manage Goals</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className={styles.modalHint}>
          Most specific rule wins: agent + campaign, then agent only, then campaign only, then the global default.
        </p>

        <div className={styles.goalsList}>
          {goals.map((g) => (
            <div key={g.id} className={styles.goalRow}>
              <div className={styles.goalScope}>{scopeLabel(g)}</div>
              <div className={styles.goalNums}>
                {g.daily_appointment_goal} appt/day · {g.daily_show_goal} shows/day
              </div>
              <div className={styles.goalActions}>
                <button type="button" onClick={() => startEdit(g)}>
                  Edit
                </button>
                {(g.user_id || g.campaign_name) && (
                  <button type="button" className={styles.dangerLink} onClick={() => handleDelete(g.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {editingId === null ? (
          <button type="button" className={styles.addRuleBtn} onClick={startNew}>
            + Add override
          </button>
        ) : (
          <div className={styles.editForm}>
            <label className={styles.field}>
              <span>Agent</span>
              <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">— Everyone —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Campaign</span>
              <select value={campaignName} onChange={(e) => setCampaignName(e.target.value)}>
                <option value="">— Any campaign —</option>
                {campaignField.options.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Daily appointment goal</span>
              <input type="number" min={0} value={appGoal} onChange={(e) => setAppGoal(Number(e.target.value))} />
            </label>
            <label className={styles.field}>
              <span>Daily show goal</span>
              <input type="number" min={0} value={showGoal} onChange={(e) => setShowGoal(Number(e.target.value))} />
            </label>
            <div className={styles.editActions}>
              <button type="button" onClick={() => setEditingId(null)}>
                Cancel
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
