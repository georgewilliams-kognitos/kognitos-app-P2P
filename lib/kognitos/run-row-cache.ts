import type { KognitosRunRow } from "@/lib/db";
import {
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
  type FourWayMatchResult,
  type RunSummary,
} from "@/lib/p2p-insights";

export function fourWayForRow(row: KognitosRunRow): FourWayMatchResult | null {
  if (row.cachedFourWay !== undefined) return row.cachedFourWay;
  return extractFourWayMatchFromRun(row.run);
}

export function summaryForRow(row: KognitosRunRow): RunSummary {
  return row.cachedSummary ?? buildRunSummaryFromRun(row.run);
}
