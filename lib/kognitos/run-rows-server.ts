import { supabase, supabaseAdmin } from "@/lib/supabase";
import { parseKognitosRunPayload } from "@/lib/kognitos/map-run";
import {
  slimKognitosPayloadForClient,
  slimRunForClientTransport,
} from "@/lib/kognitos/slim-run-payload";
import {
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
  extractVendorFromRun,
} from "@/lib/p2p-insights";
import type { KognitosRunRow } from "@/lib/db";

function sb() {
  const client = supabaseAdmin ?? supabase;
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return client;
}

/** Server-side fetch + slim payload for list views (Invoices, Dashboard). */
export async function fetchKognitosRunRowsFromSupabase(): Promise<
  KognitosRunRow[]
> {
  const { data, error } = await sb()
    .from("kognitos_runs")
    .select("id, name, payload")
    .order("create_time", { ascending: false });
  if (error) throw error;

  const out: KognitosRunRow[] = [];
  for (const row of data ?? []) {
    const fullPayload =
      row.payload != null &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const run = parseKognitosRunPayload(row.payload);
    if (!run) continue;
    const vendorName = extractVendorFromRun(run);
    let slimRun = slimRunForClientTransport(run);
    if (vendorName?.trim()) {
      slimRun = {
        ...slimRun,
        userInputs: {
          ...slimRun.userInputs,
          supplier_name: vendorName.trim(),
        },
      };
    }
    out.push({
      id: String(row.id),
      name: String(row.name),
      run: slimRun,
      payloadRaw: slimKognitosPayloadForClient(fullPayload),
      cachedSummary: buildRunSummaryFromRun(run),
      cachedFourWay: extractFourWayMatchFromRun(run),
    });
  }
  return out;
}
