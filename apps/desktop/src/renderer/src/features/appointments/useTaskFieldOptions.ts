import { useEffect, useState } from 'react';
import { listTaskFieldOptions, getTaskFieldConfig } from '@amber-flow/shared';
import type { TaskFieldName, TaskFieldMode, TaskFieldOption } from '@amber-flow/shared';

// Loads the admin-managed Account/Campaign dropdown values plus each field's
// mode (dropdown vs free text) for the New/Edit Appointment modal. Name kept
// from the underlying task_field_options/task_field_config tables (Account
// and Campaign options used to be Task-only fields; they're now shared with
// Appointments, so this hook moved out of the old tasks feature folder).
export function useTaskFieldOptions(field: TaskFieldName) {
  const [options, setOptions] = useState<TaskFieldOption[]>([]);
  const [mode, setMode] = useState<TaskFieldMode>('dropdown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listTaskFieldOptions(field), getTaskFieldConfig()]).then(([optRes, cfgRes]) => {
      if (cancelled) return;
      if (optRes.data) setOptions(optRes.data);
      const cfg = cfgRes.data?.find((c) => c.field === field);
      if (cfg) setMode(cfg.mode);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [field]);

  return { options, mode, loading };
}
