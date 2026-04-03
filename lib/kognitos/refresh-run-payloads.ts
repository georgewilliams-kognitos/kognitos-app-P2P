import { supabaseAdmin } from "@/lib/supabase";
import { getRunRaw, queryInsights, queryMetrics } from "./client-core";
import { getRunTimesFromPayload } from "./run-payload";
import { reindexVendorInvoicesForRun } from "./vendor-invoice-index";
import { recomputeP2pInsightsFromDb } from "./recompute-p2p-insights-from-db";

/**
 * Re-fetch each run from Kognitos GET Run and replace `kognitos_runs.payload` with unmapped JSON
 * (so `user_inputs` / `file.remote` are present). Re-runs vendor invoice indexing per row.
 * Run after switching ListRuns storage to raw JSON, or to repair older rows.
 */
export async function refreshAllRunPayloadsFromKognitos(): Promise<{
  ok: boolean;
  updated: number;
  failed: number;
  error?: string;
}> {
  if (!supabaseAdmin) {
    return { ok: false, updated: 0, failed: 0, error: "supabase_admin_missing" };
  }
  const hasEnv =
    process.env.KOGNITOS_BASE_URL &&
    (process.env.KOGNITOS_API_KEY || process.env.KOGNITOS_PAT) &&
    (process.env.KOGNITOS_ORGANIZATION_ID || process.env.KOGNITOS_ORG_ID) &&
    process.env.KOGNITOS_WORKSPACE_ID &&
    process.env.KOGNITOS_AUTOMATION_ID;
  if (!hasEnv) {
    return { ok: false, updated: 0, failed: 0, error: "kognitos_env_missing" };
  }

  const { data, error } = await supabaseAdmin.from("kognitos_runs").select("id");
  if (error) return { ok: false, updated: 0, failed: 0, error: error.message };

  let updated = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const id = String(row.id);
    try {
      const raw = await getRunRaw(id);
      if (!raw) {
        failed += 1;
        continue;
      }
      const times = getRunTimesFromPayload(raw);
      const nm = String(raw.name ?? "");
      const { error: upErr } = await supabaseAdmin
        .from("kognitos_runs")
        .update({
          payload: raw,
          ...(nm ? { name: nm } : {}),
          create_time: times.create,
          update_time: times.update,
        })
        .eq("id", id);
      if (upErr) {
        failed += 1;
        continue;
      }
      updated += 1;
      await reindexVendorInvoicesForRun(id, raw);
    } catch {
      failed += 1;
    }
  }

  try {
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
  } catch {
    /* optional */
  }

  return { ok: true, updated, failed };
}
