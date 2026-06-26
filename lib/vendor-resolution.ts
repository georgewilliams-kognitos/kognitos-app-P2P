import type { KognitosRunRow } from "@/lib/db";
import { resolveVendorByDisplayName } from "@/lib/db";
import { extractVendorFromRun } from "@/lib/p2p-insights";
import type { KognitosRun, Vendor } from "@/lib/types";

/** Best vendor lookup key from a run (slim client payload or indexed id). */
export function vendorHintFromRun(run: KognitosRun): string {
  return (
    extractVendorFromRun(run)?.trim() ||
    run.userInputs?.supplier_name?.trim() ||
    run.userInputs?.vendor_name?.trim() ||
    ""
  );
}

/** Resolve a run row to a vendor master record, or null when unknown. */
export function resolveVendorForRunRow(
  vendors: Vendor[],
  row: Pick<KognitosRunRow, "id" | "run">,
  vendorIdByRunId?: Record<string, string>,
): Vendor | null {
  if (vendors.length === 0) return null;

  const indexedId = vendorIdByRunId?.[row.id]?.trim();
  if (indexedId) {
    const byIndex = vendors.find((v) => v.vendor_id === indexedId);
    if (byIndex) return byIndex;
  }

  const hint = vendorHintFromRun(row.run);
  if (!hint) return null;
  return resolveVendorByDisplayName(vendors, hint);
}

export function isVendorResolvableRunRow(
  vendors: Vendor[],
  row: KognitosRunRow,
  vendorIdByRunId?: Record<string, string>,
): boolean {
  return resolveVendorForRunRow(vendors, row, vendorIdByRunId) != null;
}

/** Drop runs whose vendor cannot be matched to the vendor master. */
export function filterRunRowsWithResolvableVendor(
  vendors: Vendor[],
  rows: KognitosRunRow[],
  vendorIdByRunId?: Record<string, string>,
): KognitosRunRow[] {
  if (vendors.length === 0) return [];
  return rows.filter((row) =>
    isVendorResolvableRunRow(vendors, row, vendorIdByRunId),
  );
}

export type BuildP2pTriageAlertsOptions = {
  max?: number;
  vendors?: Vendor[];
  vendorIdByRunId?: Record<string, string>;
};

export type HiddenVendorSummary = {
  rawName: string;
  runCount: number;
};

/** Runs whose extracted supplier id/name is not in the vendor master. */
export function buildHiddenVendorSummaries(
  vendors: Vendor[],
  rows: KognitosRunRow[],
  vendorIdByRunId?: Record<string, string>,
): HiddenVendorSummary[] {
  if (vendors.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (isVendorResolvableRunRow(vendors, row, vendorIdByRunId)) continue;
    const hint = vendorHintFromRun(row.run);
    if (!hint) continue;
    counts.set(hint, (counts.get(hint) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([rawName, runCount]) => ({ rawName, runCount }))
    .sort(
      (a, b) =>
        b.runCount - a.runCount || a.rawName.localeCompare(b.rawName),
    );
}
