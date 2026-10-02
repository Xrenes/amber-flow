import React, { useMemo, useState } from 'react';
import { upsertAgentGoal, deleteAgentGoal } from '@amber-flow/shared';
import type { AgentGoal } from '@amber-flow/shared';
import { useTaskFieldOptions } from '../appointments/useTaskFieldOptions';
import { isDemoMode } from '../../demo/demoData';
import type { AdminData } from './useAdminData';
import { useGoalAttainment, type AgentAttainmentRow, type PeriodKey } from './useGoalAttainment';
import AdminToolbar from './AdminToolbar';
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

type SortKey =
  | 'name'
  | 'appointments'
  | 'shows'
  | 'activeDays'
  | 'calcAppointmentGoal'
  | 'calcShowGoal'
  | 'appAttainmentPct'
  | 'showAttainmentPct'
  | 'showRatePct'
  | 'hours'
  | 'avgAppsPerDay'
  | 'avgShowsPerDay'
  | 'status';

type StatusFilter = 'all' | 'meets' | 'below';

// One column header -> its sort key, display label and (where it isn't
// self-explanatory) a one-line explanation shown as a tooltip.
const COLUMNS: { key: SortKey; label: string; help?: string }[] = [
  { key: 'name', label: 'Agent' },
  { key: 'appointments', label: 'Appointments', help: 'Booked in this period.' },
  { key: 'shows', label: 'Shows', help: 'Appointments marked "showed".' },
  { key: 'activeDays', label: 'Active Days', help: 'Distinct days this agent tracked any time in the period.' },
  { key: 'calcAppointmentGoal', label: 'Calc App Goal', help: 'Daily appointment goal × Active Days.' },
  { key: 'calcShowGoal', label: 'Calc Show Goal', help: 'Daily show goal × Active Days.' },
  { key: 'appAttainmentPct', label: 'App Attainment', help: 'Appointments ÷ Calc App Goal.' },
  { key: 'showAttainmentPct', label: 'Show Attainment', help: 'Shows ÷ Calc Show Goal.' },
  { key: 'showRatePct', label: 'Show Rate', help: 'Shows ÷ Appointments — independent of any goal.' },
  { key: 'hours', label: 'Hours', help: 'Total tracked time in the period.' },
  { key: 'avgAppsPerDay', label: 'Avg Apps/Day', help: 'Appointments ÷ Active Days.' },
  { key: 'avgShowsPerDay', label: 'Avg Shows/Day', help: 'Shows ÷ Active Days.' },
  { key: 'status', label: 'Status', help: 'Meets Goal needs both attainments at 100% or more.' },
];

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

// green at/above goal, amber getting close, red well short — same read at a
// glance for every percentage cell in the sheet.
function pctClass(n: number): string {
  if (n >= 100) return styles.pctGood;
  if (n >= 75) return styles.pctWarn;
  return styles.pctBad;
}

function sortValue(r: AgentAttainmentRow, key: SortKey): number | string {
  if (key === 'name') return r.name.toLowerCase();
  if (key === 'status') return r.meetsGoal ? 1 : 0;
  return r[key];
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'appointments', dir: 'desc' });

  const reportDate = useMemo(() => new Date(`${reportDateStr}T12:00:00`), [reportDateStr]);
  const { goals, loading, weekRows, monthRows, quarterRows } = useGoalAttainment(data, reportDate);

  const rows = period === 'week' ? weekRows : period === 'month' ? monthRows : quarterRows;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
    if (statusFilter !== 'all') list = list.filter((r) => (statusFilter === 'meets' ? r.meetsGoal : !r.meetsGoal));
    return [...list].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, statusFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  }

  const meetsCount = rows.filter((r) => r.meetsGoal).length;

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
        Calculated goals use each agent's resolved daily target (global default unless a per-agent, per-campaign, or
        per-agent-name override applies) × their Active Days in the {PERIOD_LABELS[period].toLowerCase()} window
        ending on the Report Date. <strong>{meetsCount}</strong> of <strong>{rows.length}</strong> agents are meeting
        goal this {period === 'week' ? 'week' : period === 'month' ? 'month' : 'quarter'}. Click a column to sort by
        it; hover a header for what it means.
      </p>

      <AdminToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search agent…"
        sortOptions={COLUMNS.filter((c) => c.key !== 'status').map((c) => ({ key: c.key, label: c.label }))}
        sortValue={sort.key}
        onSortChange={(v) => toggleSort(v as SortKey)}
        filterOptions={[
          { key: 'all', label: 'All agents' },
          { key: 'meets', label: 'Meets Goal' },
          { key: 'below', label: 'Below Goal' },
        ]}
        filterValue={statusFilter}
        onFilterChange={(v) => setStatusFilter(v as StatusFilter)}
      />

      <div className={sharedStyles.tableWrap}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} title={c.help}>
                  <button type="button" className={styles.sortBtn} onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className={`${styles.sortIcon} ${sort.key === c.key ? styles.sortIconActive : ''}`}>
                      {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className={sharedStyles.tableEmpty}>
                  {rows.length === 0 ? 'No agents found.' : 'No agents match these filters.'}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <AttainmentRow key={r.userId} row={r} />
            ))}
          </tbody>
        </table>
      </div>

      {goalsOpen && (
        <GoalsManagerModal goals={goals} profiles={data.profiles} onClose={() => setGoalsOpen(false)} />
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
      <td className={pctClass(row.appAttainmentPct)}>{fmtPct(row.appAttainmentPct)}</td>
      <td className={pctClass(row.showAttainmentPct)}>{fmtPct(row.showAttainmentPct)}</td>
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

export interface GoalsManagerModalProps {
  goals: AgentGoal[];
  // Every profile (role unfiltered) — the list is filtered to agent role
  // inside, keeping that concern local to this component.
  profiles: { id: string; name: string; role: string }[];
  onClose: () => void;
}

// Global default + per-agent + per-campaign override editor. Each row is one
// agent_goals record; scope is chosen via the Agent/Campaign dropdowns
// (— Everyone — / — Any campaign — map to NULL, i.e. the wildcard).
export function GoalsManagerModal({ goals, profiles, onClose }: GoalsManagerModalProps) {
  const campaignField = useTaskFieldOptions('campaign');
  const agentField = useTaskFieldOptions('agent');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  // "agent" selector value is "login:<id>" for a teammate with a login, or
  // "name:<name>" for a plain Field Options agent with none.
  const [agentKey, setAgentKey] = useState<string>('');
  const [campaignName, setCampaignName] = useState<string>('');
  const [appGoal, setAppGoal] = useState(3);
  const [showGoal, setShowGoal] = useState(2);
  const [saving, setSaving] = useState(false);

  // Every agent that can be given a goal: logins (role === 'agent') plus
  // the admin-managed Agent list, de-duplicated by name — the same roster
  // agent_name attribution uses everywhere else in the app, so a name-only
  // agent (no login) can get a per-agent override too.
  const agentOptions = useMemo(() => {
    const logins = profiles.filter((p) => p.role === 'agent');
    const byLoginName = new Set(logins.map((p) => p.name.trim().toLowerCase()));
    const nameOnly = agentField.options.map((o) => o.value).filter((name) => !byLoginName.has(name.trim().toLowerCase()));
    return [
      ...logins.map((p) => ({ key: `login:${p.id}`, label: p.name })),
      ...nameOnly.map((name) => ({ key: `name:${name}`, label: name })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }, [profiles, agentField.options]);

  function startNew() {
    setEditingId('new');
    setAgentKey('');
    setCampaignName('');
    setAppGoal(3);
    setShowGoal(2);
  }

  function startEdit(g: AgentGoal) {
    setEditingId(g.id);
    setAgentKey(g.user_id ? `login:${g.user_id}` : g.agent_name ? `name:${g.agent_name}` : '');
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
    const [kind, value] = agentKey.split(/:(.*)/s);
    await upsertAgentGoal({
      id: editingId !== 'new' ? (editingId as string) : undefined,
      userId: kind === 'login' ? value : null,
      agentName: kind === 'name' ? value : null,
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
    const agentPart = g.user_id
      ? profiles.find((p) => p.id === g.user_id)?.name || 'Unknown agent'
      : g.agent_name || 'Everyone';
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
              <select value={agentKey} onChange={(e) => setAgentKey(e.target.value)}>
                <option value="">— Everyone —</option>
                {agentOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
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
