import { supabaseAdmin } from "@/lib/supabase";
import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
  getStateLabel,
  type FourWayMatchResult,
  type P2PInsights,
} from "@/lib/p2p-insights";
import { parseKognitosRunPayload } from "./map-run";
import {
  getAutomationRunAggregates,
  listAllRunsForAutomation,
  queryInsights,
  queryMetrics,
} from "./client";
import { runShortIdFromName } from "./stage";

export async function recomputeP2pInsightsFromDb(): Promise<P2PInsights> {
  if (!supabaseAdmin) {
    return aggregateResults([], []);
  }
  const { data, error } = await supabaseAdmin.from("kognitos_runs").select("payload");
  if (error) throw error;
  const results: FourWayMatchResult[] = [];
  const summaries = [];
  for (const row of data ?? []) {
    const run = parseKognitosRunPayload(row.payload);
    if (!run) continue;
    const parsed = extractFourWayMatchFromRun(run);
    if (parsed) results.push(parsed);
    summaries.push(buildRunSummaryFromRun(run));
  }
  return aggregateResults(results, summaries);
}

async function listExistingRunIds(): Promise<Set<string>> {
  if (!supabaseAdmin) return new Set();
  const { data, error } = await supabaseAdmin.from("kognitos_runs").select("id");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Latest `create_time` among stored runs (RFC3339), or null if none / all null. */
async function getLatestRunCreateTimeIso(): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("kognitos_runs")
    .select("create_time")
    .order("create_time", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error || data == null || data.create_time == null) return null;
  const t = data.create_time as string;
  return typeof t === "string" ? t : new Date(t).toISOString();
}

/**
 * AIP-160 filter for ListRuns: runs at or after the last stored create_time.
 * Skips re-fetching older history; combined with id de-dupe for overlap.
 */
function buildIncrementalCreateTimeFilter(lastCreateTimeIso: string): string {
  return `create_time >= "${lastCreateTimeIso}"`;
}

export type KognitosRefreshResult = {
  ok: boolean;
  written: boolean;
  newRuns: number;
  newRunIds: string[];
  mode: "full" | "incremental";
  sinceCreateTime: string | null;
  fetchedFromKognitos: number;
  skippedAlreadyInDb: number;
  error?: string;
};

export async function runKognitosRefresh(): Promise<KognitosRefreshResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      written: false,
      newRuns: 0,
      newRunIds: [],
      mode: "full",
      sinceCreateTime: null,
      fetchedFromKognitos: 0,
      skippedAlreadyInDb: 0,
      error: "supabase_admin_missing",
    };
  }

  const lastCreateIso = await getLatestRunCreateTimeIso();
  const existingIds = await listExistingRunIds();

  const isFullBackfill = lastCreateIso == null;
  const filter = isFullBackfill
    ? undefined
    : buildIncrementalCreateTimeFilter(lastCreateIso);

  const remote = await listAllRunsForAutomation({
    pageSize: 100,
    filter,
  });

  let skippedAlreadyInDb = 0;
  const inserted: string[] = [];

  for (const run of remote) {
    const id = runShortIdFromName(run.name);
    if (!id) continue;
    if (existingIds.has(id)) {
      skippedAlreadyInDb += 1;
      continue;
    }

    const row = {
      id,
      name: run.name,
      payload: run as unknown as Record<string, unknown>,
      create_time: run.createTime || null,
      update_time: run.updateTime || null,
    };
    const { error } = await supabaseAdmin.from("kognitos_runs").insert(row);
    if (error) {
      if (error.code === "23505") {
        skippedAlreadyInDb += 1;
        existingIds.add(id);
        continue;
      }
      throw error;
    }
    inserted.push(id);
    existingIds.add(id);

    const reqId = run.userInputs?.request_id;
    if (reqId) {
      await supabaseAdmin
        .from("requests")
        .update({
          kognitos_run_id: row.id,
          kognitos_run_state: getStateLabel(run),
          updated_at: new Date().toISOString(),
        })
        .eq("id", reqId);
    }
  }

  if (inserted.length === 0) {
    return {
      ok: true,
      written: false,
      newRuns: 0,
      newRunIds: [],
      mode: isFullBackfill ? "full" : "incremental",
      sinceCreateTime: lastCreateIso,
      fetchedFromKognitos: remote.length,
      skippedAlreadyInDb,
    };
  }

  const insights = await queryInsights();
  const metrics = await queryMetrics();
  const p2p = await recomputeP2pInsightsFromDb();

  await supabaseAdmin.from("kognitos_insights_cache").upsert(
    {
      id: "default",
      insights_json: insights as unknown as Record<string, unknown>,
      p2p_summary: p2p as unknown as Record<string, unknown>,
      metrics_json: metrics as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  try {
    const { automationRunAggregates } = await getAutomationRunAggregates();
    const envAuto = process.env.KOGNITOS_AUTOMATION_ID ?? "";
    const match = automationRunAggregates.find(
      (a) =>
        a.automationId === envAuto ||
        a.automationId.endsWith(`/automations/${envAuto}`),
    );
    if (match) {
      await supabaseAdmin
        .from("rules")
        .update({
          automation_id: match.automationId,
          total_runs: match.stats.totalRuns,
          completed_runs: match.stats.completedRuns,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "rule-1");
    }
  } catch {
    /* optional */
  }

  return {
    ok: true,
    written: true,
    newRuns: inserted.length,
    newRunIds: inserted,
    mode: isFullBackfill ? "full" : "incremental",
    sinceCreateTime: lastCreateIso,
    fetchedFromKognitos: remote.length,
    skippedAlreadyInDb,
  };
}
