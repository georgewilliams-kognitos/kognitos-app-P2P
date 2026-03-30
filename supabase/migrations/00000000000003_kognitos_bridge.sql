-- Kognitos bridge (runs + insights cache; no run events)
-- Aligns requests with kognitos_runs; drops episode_id; extends rules for automation stats.

-- ── Tables ─────────────────────────────────────────────────────
CREATE TABLE kognitos_runs (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  create_time timestamptz,
  update_time timestamptz,
  inserted_at timestamptz DEFAULT now()
);

CREATE INDEX idx_kognitos_runs_create_time ON kognitos_runs (create_time DESC);

CREATE TABLE kognitos_insights_cache (
  id text PRIMARY KEY,
  insights_json jsonb,
  p2p_summary jsonb,
  metrics_json jsonb,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO kognitos_insights_cache (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- ── Requests: drop episode_id, add run state, FK to kognitos_runs ──
ALTER TABLE requests DROP COLUMN IF EXISTS episode_id;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS kognitos_run_state text;

-- Placeholder runs so existing seed FKs resolve (seed upsert may replace payloads).
INSERT INTO kognitos_runs (id, name, payload, create_time, update_time) VALUES
(
  'run-1',
  'workspaces/ws-1/runs/run-1',
  jsonb_build_object(
    'name', 'workspaces/ws-1/runs/run-1',
    'createTime', '2026-02-20T09:00:00Z',
    'updateTime', '2026-02-20T09:04:32Z',
    'state', jsonb_build_object(
      'completed', jsonb_build_object(
        'outputs', jsonb_build_object('status', 'approved', 'reviewer_notes', 'Budget within limits', 'confidence_score', '85')
      )
    ),
    'stage', 'AUTOMATION_STAGE_PUBLISHED',
    'stageVersion', '1.0',
    'invocationDetails', jsonb_build_object('invocationSource', 'INVOCATION_SOURCE_MANUAL'),
    'userInputs', jsonb_build_object('request_id', 'req-3', 'title', 'Annual Figma Enterprise license renewal', 'category', 'software')
  ),
  '2026-02-20T09:00:00Z'::timestamptz,
  '2026-02-20T09:04:32Z'::timestamptz
),
(
  'run-2',
  'workspaces/ws-1/runs/run-2',
  jsonb_build_object(
    'name', 'workspaces/ws-1/runs/run-2',
    'createTime', '2026-02-21T14:30:00Z',
    'updateTime', '2026-02-21T14:33:15Z',
    'state', jsonb_build_object(
      'completed', jsonb_build_object(
        'outputs', jsonb_build_object('status', 'under_review', 'escalation_reason', 'Exceeds budget threshold', 'assigned_to', 'user-3')
      )
    ),
    'stage', 'AUTOMATION_STAGE_PUBLISHED',
    'stageVersion', '1.0',
    'invocationDetails', jsonb_build_object('invocationSource', 'INVOCATION_SOURCE_MANUAL'),
    'userInputs', jsonb_build_object('request_id', 'req-5', 'title', 'Office printer replacement', 'category', 'equipment')
  ),
  '2026-02-21T14:30:00Z'::timestamptz,
  '2026-02-21T14:33:15Z'::timestamptz
),
(
  'run-3',
  'workspaces/ws-1/runs/run-3',
  jsonb_build_object(
    'name', 'workspaces/ws-1/runs/run-3',
    'createTime', '2026-02-10T10:00:00Z',
    'updateTime', '2026-02-15T11:00:00Z',
    'state', jsonb_build_object(
      'completed', jsonb_build_object('outputs', jsonb_build_object('status', 'under_review'))
    ),
    'stage', 'AUTOMATION_STAGE_PUBLISHED',
    'stageVersion', '1.0',
    'invocationDetails', jsonb_build_object('invocationSource', 'INVOCATION_SOURCE_MANUAL'),
    'userInputs', jsonb_build_object('request_id', 'req-6', 'title', 'Datadog APM upgrade', 'category', 'software')
  ),
  '2026-02-10T10:00:00Z'::timestamptz,
  '2026-02-15T11:00:00Z'::timestamptz
),
(
  'run-4',
  'workspaces/ws-1/runs/run-4',
  jsonb_build_object(
    'name', 'workspaces/ws-1/runs/run-4',
    'createTime', '2026-01-20T10:00:00Z',
    'updateTime', '2026-01-28T15:00:00Z',
    'state', jsonb_build_object(
      'completed', jsonb_build_object('outputs', jsonb_build_object('status', 'approved'))
    ),
    'stage', 'AUTOMATION_STAGE_PUBLISHED',
    'stageVersion', '1.0',
    'invocationDetails', jsonb_build_object('invocationSource', 'INVOCATION_SOURCE_MANUAL'),
    'userInputs', jsonb_build_object('request_id', 'req-9', 'title', 'AWS reserved instances', 'category', 'software')
  ),
  '2026-01-20T10:00:00Z'::timestamptz,
  '2026-01-28T15:00:00Z'::timestamptz
),
(
  'run-5',
  'workspaces/ws-1/runs/run-5',
  jsonb_build_object(
    'name', 'workspaces/ws-1/runs/run-5',
    'createTime', '2026-01-05T09:00:00Z',
    'updateTime', '2026-01-15T10:00:00Z',
    'state', jsonb_build_object(
      'completed', jsonb_build_object('outputs', jsonb_build_object('status', 'closed'))
    ),
    'stage', 'AUTOMATION_STAGE_PUBLISHED',
    'stageVersion', '1.0',
    'invocationDetails', jsonb_build_object('invocationSource', 'INVOCATION_SOURCE_MANUAL'),
    'userInputs', jsonb_build_object('request_id', 'req-14', 'title', 'New laptop provisioning', 'category', 'equipment')
  ),
  '2026-01-05T09:00:00Z'::timestamptz,
  '2026-01-15T10:00:00Z'::timestamptz
)
ON CONFLICT (id) DO NOTHING;

-- FK (no prior DROP needed on first apply; avoids NOTICE from DROP ... IF EXISTS on missing constraint)
ALTER TABLE requests
  ADD CONSTRAINT requests_kognitos_run_fkey
  FOREIGN KEY (kognitos_run_id) REFERENCES kognitos_runs (id) ON DELETE SET NULL;

-- ── Rules: automation / aggregate columns ─────────────────────
ALTER TABLE rules ADD COLUMN IF NOT EXISTS automation_id text;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS total_runs integer;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS completed_runs integer;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS stp_rate numeric(6, 3);

-- ── RLS (read-only for anon; writes via service role in API routes) ──
ALTER TABLE kognitos_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kognitos_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON kognitos_runs FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON kognitos_insights_cache FOR SELECT USING (true);
