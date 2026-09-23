-- ═══════════════════════════════════════════════════════════════════════════
-- Amber Flow — Agent evaluations (admin-defined criteria, scored + noted)
-- Run this in: Supabase Dashboard → SQL Editor → New Query (after 003_*.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Admin-managed evaluation criteria ───────────────────────────────────
-- Starts empty; admin adds criteria from the Admin Panel (e.g.
-- "Communication", "Task Completion", "Reliability"). Read is open to
-- everyone so an agent viewing a shared evaluation can see criterion names.
CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation_criteria_read_all" ON public.evaluation_criteria;
CREATE POLICY "evaluation_criteria_read_all" ON public.evaluation_criteria
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "evaluation_criteria_admin_write" ON public.evaluation_criteria;
CREATE POLICY "evaluation_criteria_admin_write" ON public.evaluation_criteria
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- ── Evaluations ──────────────────────────────────────────────────────────
-- One row per evaluation event. `visible_to_agent` is admin-controlled per
-- evaluation — some can be shared with the evaluated agent, others kept
-- internal to admin/manager only.
CREATE TABLE IF NOT EXISTS public.evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluator_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  visible_to_agent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Admin/manager can do everything.
DROP POLICY IF EXISTS "evaluations_admin_all" ON public.evaluations;
CREATE POLICY "evaluations_admin_all" ON public.evaluations
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Agent can read only their own evaluations that were explicitly shared.
DROP POLICY IF EXISTS "evaluations_agent_view_shared" ON public.evaluations;
CREATE POLICY "evaluations_agent_view_shared" ON public.evaluations
  FOR SELECT USING (agent_id = auth.uid() AND visible_to_agent = true);

-- ── Evaluation scores ────────────────────────────────────────────────────
-- One row per criterion within an evaluation. `rating` is free-form for now
-- (recorded, not validated against a fixed scale) — a plain integer, admin
-- decides what scale to use when entering it.
CREATE TABLE IF NOT EXISTS public.evaluation_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criterion_id   UUID NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE CASCADE,
  rating         INT,
  notes          TEXT,
  UNIQUE (evaluation_id, criterion_id)
);

ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation_scores_admin_all" ON public.evaluation_scores;
CREATE POLICY "evaluation_scores_admin_all" ON public.evaluation_scores
  FOR ALL USING (get_my_role() IN ('admin', 'manager'))
  WITH CHECK (get_my_role() IN ('admin', 'manager'));

-- Agent can read scores that belong to an evaluation shared with them.
DROP POLICY IF EXISTS "evaluation_scores_agent_view_shared" ON public.evaluation_scores;
CREATE POLICY "evaluation_scores_agent_view_shared" ON public.evaluation_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_scores.evaluation_id
        AND e.agent_id = auth.uid()
        AND e.visible_to_agent = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_evaluations_agent ON public.evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_scores_eval ON public.evaluation_scores(evaluation_id);
