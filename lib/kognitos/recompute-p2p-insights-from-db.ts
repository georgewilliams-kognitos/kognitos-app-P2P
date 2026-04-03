import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
  type FourWayMatchResult,
  type P2PInsights,
} from "@/lib/p2p-insights";
import { supabaseAdmin } from "@/lib/supabase";
import { parseKognitosRunPayload } from "./map-run";

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
