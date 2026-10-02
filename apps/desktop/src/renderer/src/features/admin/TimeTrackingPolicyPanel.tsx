import React, { useEffect, useState } from 'react';
import {
  getTimeTrackingPolicy,
  setTimeTrackingPolicy,
  subscribeToAppSettings,
  getSupabase,
  DEFAULT_TIME_TRACKING_POLICY,
  type TimeTrackingPolicy,
} from '@amber-flow/shared';
import { isDemoMode } from '../../demo/demoData';
import styles from './SettingsTab.module.css';

// Admin → Settings: the company-wide tracking policy every agent's Time
// Tracker reads (packages/shared/src/api/timeTrackingPolicy.ts) — how long
// they should track per day, the expected work window, and how long a
// break may run before it's flagged. Saved once, applies everywhere live.
export default function TimeTrackingPolicyPanel() {
  const [policy, setPolicy] = useState<TimeTrackingPolicy>(DEFAULT_TIME_TRACKING_POLICY);
  const [loading, setLoading] = useState(!isDemoMode());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    function refresh() {
      getTimeTrackingPolicy().then((p) => {
        if (cancelled) return;
        if (p) setPolicy(p);
        setLoading(false);
      });
    }
    refresh();
    const channel = subscribeToAppSettings(refresh);
    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    if (!isDemoMode()) {
      const { error: err } = await setTimeTrackingPolicy(policy);
      if (err) {
        setSaving(false);
        setError(err.message);
        return;
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <p className={styles.hint}>Loading…</p>;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Time Tracking Policy</div>
      <p className={styles.cardHint}>
        Applies to every agent's Time Tracker, live. The daily goal becomes each agent's default — they can still
        adjust it on their own device, but a new policy value takes over again for anyone who hasn't. Work hours and
        the break limit are shown as guidance; they don't block starting the tracker or ending a break early.
      </p>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Daily track goal</span>
          <div className={styles.inlineInput}>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={policy.dailyTrackGoalHours}
              onChange={(e) => setPolicy((p) => ({ ...p, dailyTrackGoalHours: Number(e.target.value) }))}
            />
            <span>hours / day</span>
          </div>
        </label>

        <label className={styles.field}>
          <span>Work hours — start</span>
          <input
            type="time"
            value={policy.workStart}
            onChange={(e) => setPolicy((p) => ({ ...p, workStart: e.target.value }))}
          />
        </label>

        <label className={styles.field}>
          <span>Work hours — end</span>
          <input
            type="time"
            value={policy.workEnd}
            onChange={(e) => setPolicy((p) => ({ ...p, workEnd: e.target.value }))}
          />
        </label>

        <label className={styles.field}>
          <span>Max break length</span>
          <div className={styles.inlineInput}>
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={policy.maxBreakMinutes}
              onChange={(e) => setPolicy((p) => ({ ...p, maxBreakMinutes: Number(e.target.value) }))}
            />
            <span>minutes</span>
          </div>
        </label>
      </div>

      <div className={styles.cardFooter}>
        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save policy'}
        </button>
        {saved && <span className={styles.success}>Saved — every agent's tracker updates now.</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
