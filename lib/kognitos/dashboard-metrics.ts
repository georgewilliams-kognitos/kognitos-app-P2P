import type { KognitosRun } from "@/lib/types";
import {
  buildRunSummaryFromRun,
  extractExtractionFieldValuesFromRun,
  extractVendorFromRun,
} from "@/lib/p2p-insights";

/** Mean wall-clock duration (create → last update) for the given runs (e.g. completed-only). */
export function averageRunDurationMs(runs: KognitosRun[]): number | null {
  const durations: number[] = [];
  for (const run of runs) {
    const start = Date.parse(run.createTime);
    const end = Date.parse(run.updateTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    durations.push(end - start);
  }
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Most frequent vendor string across runs (user inputs + markdown). */
export function topVendorFromRuns(runs: KognitosRun[]): {
  vendor: string;
  count: number;
} | null {
  const counts = new Map<string, { vendor: string; count: number }>();
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  for (const run of runs) {
    const v = extractVendorFromRun(run);
    if (!v) continue;
    const key = norm(v);
    if (!key) continue;
    const prev = counts.get(key);
    if (!prev) counts.set(key, { vendor: v.trim().replace(/\s+/g, " "), count: 1 });
    else counts.set(key, { vendor: prev.vendor, count: prev.count + 1 });
  }
  let best: { vendor: string; count: number } | null = null;
  for (const row of counts.values()) {
    if (!best || row.count > best.count) best = row;
  }
  return best;
}

export function topVendorStatsFromRuns(runs: KognitosRun[]): {
  vendor: string;
  count: number;
  approvedPaymentsTotal: number;
} | null {
  const top = topVendorFromRuns(runs);
  if (!top) return null;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const target = norm(top.vendor);
  let approvedPaymentsTotal = 0;
  for (const run of runs) {
    const vendor = extractVendorFromRun(run);
    if (!vendor || norm(vendor) !== target) continue;
    const summary = buildRunSummaryFromRun(run);
    if (summary.paymentApproved === true) {
      approvedPaymentsTotal += summary.poTotalValue ?? 0;
    }
  }
  return {
    vendor: top.vendor,
    count: top.count,
    approvedPaymentsTotal,
  };
}

function parseCountValue(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function topMaterialFromRuns(runs: KognitosRun[]): {
  material: string;
  totalCount: number;
} | null {
  const materialCounts = new Map<string, { material: string; totalCount: number }>();
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

  for (const run of runs) {
    const summary = buildRunSummaryFromRun(run);
    if (summary.paymentApproved !== true) continue;

    const material =
      extractExtractionFieldValuesFromRun(run, [
        "material",
        "material_name",
        "material_number",
      ])[0] ?? "";
    if (!material) continue;

    const countRaw =
      extractExtractionFieldValuesFromRun(run, ["count"])[0] ??
      extractExtractionFieldValuesFromRun(run, ["quantity"])[0] ??
      "1";
    const qty = Math.max(1, parseCountValue(countRaw));
    const key = norm(material);
    const prev = materialCounts.get(key);
    if (!prev) {
      materialCounts.set(key, {
        material: material.trim().replace(/\s+/g, " "),
        totalCount: qty,
      });
    } else {
      materialCounts.set(key, {
        material: prev.material,
        totalCount: prev.totalCount + qty,
      });
    }
  }

  let best: { material: string; totalCount: number } | null = null;
  for (const row of materialCounts.values()) {
    if (!best || row.totalCount > best.totalCount) best = row;
  }
  return best;
}
