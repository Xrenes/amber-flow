import React, { useEffect, useState } from 'react';
import { getSupabase, listAgentGoals, subscribeToAgentGoals, type AgentGoal } from '@amber-flow/shared';
import { isDemoMode, demoProfiles } from '../../demo/demoData';
import type { AdminData } from './useAdminData';
import TaskFieldsTab from './TaskFieldsTab';
import TimeTrackingPolicyPanel from './TimeTrackingPolicyPanel';
import CreateAccountPanel from './CreateAccountPanel';
import TeamAccountsPanel from './TeamAccountsPanel';
import { GoalsManagerModal } from './GoalAttainmentTab';
import { useTrackingSheetUrl } from './useTrackingSheetUrl';
import styles from './SettingsTab.module.css';

interface Props {
  data: AdminData;
  onChanged: () => void;
  onNavigate: (tab: string) => void;
}

// Admin Panel → Settings: one page that controls everything an admin would
// otherwise hunt across several tabs for — Field Options, the central Time
// Tracking Policy, Goal rules, Team Accounts (full edit, not just create),
// and the external Tracking Sheet link. Sections that already have a
// focused, full-featured tab of their own (Goal Attainment's reporting,
// the Tracking Sheet viewer) get a quick summary + a jump-to-tab button
// here instead of a second copy of the same UI.
export default function SettingsTab({ data, onChanged, onNavigate }: Props) {
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const trackingSheet = useTrackingSheetUrl();

  useEffect(() => {
    if (isDemoMode()) return;
    let cancelled = false;
    function refresh() {
      listAgentGoals().then(({ data: rows }) => {
        if (!cancelled && rows) setGoals(rows as AgentGoal[]);
      });
    }
    refresh();
    const channel = subscribeToAgentGoals(refresh);
    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, []);

  const globalGoal = goals.find((g) => !g.user_id && !g.agent_name && !g.campaign_name);
  const overrideCount = goals.length - (globalGoal ? 1 : 0);
  const profiles = isDemoMode() ? demoProfiles : data.profiles;

  return (
    <div>
      <p className={styles.intro}>
        Everything that controls how Amber Flow behaves for the whole team, in one place — dropdown lists, time
        tracking rules, goals, and every team login.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Field Options</div>
            <div className={styles.sectionSub}>Account, Campaign, Project and Agent dropdown lists.</div>
          </div>
        </div>
        <TaskFieldsTab />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Time Tracking</div>
            <div className={styles.sectionSub}>Daily goal, work hours, and the break limit — applies to every agent.</div>
          </div>
        </div>
        <TimeTrackingPolicyPanel />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Goals</div>
            <div className={styles.sectionSub}>Daily appointment/show targets — global, per-campaign, per-agent.</div>
          </div>
          <button type="button" className={styles.navBtn} onClick={() => onNavigate('goals')}>
            Open Goal Attainment →
          </button>
        </div>
        <div className={styles.card}>
          <div className={styles.goalSummary}>
            <span>
              Global default: <strong>{globalGoal ? `${globalGoal.daily_appointment_goal} appt/day · ${globalGoal.daily_show_goal} shows/day` : '3 appt/day · 2 shows/day'}</strong>
            </span>
            <span>·</span>
            <span>
              <strong>{overrideCount}</strong> override{overrideCount === 1 ? '' : 's'} (per-agent or per-campaign)
            </span>
          </div>
          <button type="button" className={styles.saveBtn} onClick={() => setGoalsOpen(true)}>
            Manage Goal Rules
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Team Accounts</div>
            <div className={styles.sectionSub}>Create logins, rename, change username or role, reset passwords, deactivate or delete.</div>
          </div>
        </div>
        <CreateAccountPanel onCreated={onChanged} />
        <TeamAccountsPanel profiles={profiles} onChanged={onChanged} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Tracking Sheet</div>
            <div className={styles.sectionSub}>The external spreadsheet linked from the app.</div>
          </div>
          <button type="button" className={styles.navBtn} onClick={() => onNavigate('opensheet')}>
            Open Tracking Sheet →
          </button>
        </div>
        <div className={styles.card}>
          <div className={styles.sheetRow}>
            <span className={styles.sheetUrl}>{trackingSheet.url || 'No link set yet'}</span>
            <button type="button" className={styles.navBtn} onClick={() => onNavigate('opensheet')}>
              {trackingSheet.url ? 'Change link' : 'Set link'}
            </button>
          </div>
        </div>
      </div>

      {goalsOpen && <GoalsManagerModal goals={goals} profiles={profiles} onClose={() => setGoalsOpen(false)} />}
    </div>
  );
}
