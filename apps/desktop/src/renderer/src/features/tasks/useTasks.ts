import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSupabase,
  listTasksByUser,
  upsertTask,
  deleteTask,
  subscribeToTasks,
  type Task,
  type TaskChangePayload,
  type UpsertTaskInput,
} from '@amber-flow/shared';

// Mirrors app.js's local-first pattern: state updates immediately (optimistic
// UI), then the Supabase write fires in the background. Realtime changes from
// other devices/tabs are merged in via subscribeToTasks.
export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof subscribeToTasks> | null>(null);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    listTasksByUser(userId).then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data) setTasks(data as Task[]);
      setLoading(false);
    });

    const channel = subscribeToTasks(userId, (payload: TaskChangePayload) => {
      setTasks((prev) => applyRealtimeChange(prev, payload));
    });
    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        getSupabase().removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  // Optimistic add/update: patch local state immediately, then fire-and-forget
  // sync to Supabase (matches app.js's syncTaskToSupabase).
  const addOrUpdateTask = useCallback(
    (task: UpsertTaskInput) => {
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        const merged: Task = {
          id: task.id,
          user_id: task.user_id,
          title: task.title,
          description: task.description ?? null,
          date: task.date,
          time: task.time,
          reminder_minutes: task.reminder_minutes ?? 60,
          completed: task.completed ?? false,
          lead_status: task.lead_status ?? null,
          timezone: task.timezone ?? null,
          agent_name: task.agent_name ?? null,
          account_name: task.account_name ?? null,
          campaign_name: task.campaign_name ?? null,
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...prev[idx], ...merged };
          return next;
        }
        return [...prev, merged];
      });
      upsertTask(task).then(() => {});
    },
    []
  );

  // Optimistic delete, then fire-and-forget sync to Supabase (matches
  // app.js's deleteTaskFromSupabase).
  const removeTask = useCallback(
    (id: string) => {
      if (!userId) return;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      deleteTask(id, userId).then(() => {});
    },
    [userId]
  );

  return { tasks, addOrUpdateTask, removeTask, loading };
}

function applyRealtimeChange(prev: Task[], payload: TaskChangePayload): Task[] {
  if (payload.eventType === 'DELETE') {
    const oldId = payload.old?.id;
    if (!oldId) return prev;
    return prev.filter((t) => t.id !== oldId);
  }
  const row = payload.new;
  if (!row) return prev;
  const idx = prev.findIndex((t) => t.id === row.id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = row;
    return next;
  }
  return [...prev, row];
}
