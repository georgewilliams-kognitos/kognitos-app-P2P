import type { KognitosRun } from "@/lib/types";
import { extractVendorFromRun } from "@/lib/p2p-insights";

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
  const counts = new Map<string, number>();
  for (const run of runs) {
    const v = extractVendorFromRun(run);
    if (!v) continue;
    const key = v.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { vendor: string; count: number } | null = null;
  for (const [vendor, count] of counts) {
    if (!best || count > best.count) best = { vendor, count };
  }
  return best;
}
