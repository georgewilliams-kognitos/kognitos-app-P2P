import type { KognitosRunRow } from "@/lib/db";
import type { Vendor } from "@/lib/types";
import {
  buildRunSummaryFromRun,
  extractExtractionFieldValuesFromRun,
  extractInvoiceDateTextFromRun,
  extractQuantityAndUnitTextFromRun,
  extractVendorFromRun,
} from "@/lib/p2p-insights";

export type TriageCheckKey =
  | "documentMatch"
  | "quantityAndUnitMatch"
  | "valueMatch"
  | "coaValidation";

export interface TriageAlert {
  id: string;
  runId: string;
  createdAt: string;
  checkKey: TriageCheckKey;
  checkLabel: string;
  invoiceNumber: string;
  invoiceDateText: string;
  poNumber: string;
  vendorName: string;
  materialName: string;
  quantityText: string;
  totalInvoiceValueText: string;
  recommendation: string;
  message: string;
}

const CHECK_CONFIG: Record<
  TriageCheckKey,
  { label: string; recommendation: string }
> = {
  documentMatch: {
    label: "Document Match",
    recommendation:
      "Log in and contact the vendor to review and make sure the PO number is correct.",
  },
  quantityAndUnitMatch: {
    label: "Quantity and Unit Match",
    recommendation:
      "Contact logistics to make sure the amount received was counted correctly.",
  },
  valueMatch: {
    label: "Value Match",
    recommendation:
      "Contact the vendor to review pricing lists update documentation and re-submit Invoice",
  },
  coaValidation: {
    label: "COA Validation",
    recommendation:
      "Contact the vendor representative to review purity specifications and confirm compliance.",
  },
};

const CHECK_KEYS: TriageCheckKey[] = [
  "documentMatch",
  "quantityAndUnitMatch",
  "valueMatch",
  "coaValidation",
];

function normalizeLooseText(value: string) {
  return value
    .toLowerCase()
    .replace(/^invoice\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeInvoiceKey(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t || t === "—" || t === "unknown invoice") return null;
  return t;
}

function runTimeMs(row: KognitosRunRow): number {
  const t = row.run.updateTime || row.run.createTime || "";
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Failed payment runs for which a later run exists with the same invoice number and
 * approved payment — re-processing succeeded, so triage warnings are cleared.
 */
function getSupersededFailedRunNames(rows: KognitosRunRow[]): Set<string> {
  const superseded = new Set<string>();
  for (const row of rows) {
    const p = buildRunSummaryFromRun(row.run);
    if (p.paymentApproved !== false) continue;
    const invKey = normalizeInvoiceKey(p.invoiceNumber);
    if (!invKey) continue;
    const t0 = runTimeMs(row);
    for (const other of rows) {
      if (other.run.name === row.run.name) continue;
      const po = buildRunSummaryFromRun(other.run);
      if (normalizeInvoiceKey(po.invoiceNumber) !== invKey) continue;
      if (runTimeMs(other) <= t0) continue;
      if (po.paymentApproved === true) {
        superseded.add(row.run.name);
        break;
      }
    }
  }
  return superseded;
}

/** True when extracted vendor text matches a vendor master company name (fuzzy). */
export function vendorNameMatchesCompany(
  extractedVendor: string | null | undefined,
  companyName: string,
): boolean {
  if (!extractedVendor?.trim() || !companyName?.trim()) return false;
  const a = normalizeLooseText(extractedVendor);
  const b = normalizeLooseText(companyName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** True when extracted text is the ERP vendor id or fuzzy-matches company name. */
function vendorMasterMatchesExtracted(
  extracted: string | null | undefined,
  vendor: Pick<Vendor, "company_name" | "vendor_id">,
): boolean {
  if (!extracted?.trim()) return false;
  const t = extracted.trim();
  if (t === vendor.vendor_id) return true;
  return vendorNameMatchesCompany(extracted, vendor.company_name);
}

function triageAlertsFromRun(
  row: KognitosRunRow,
  supersededFailedRunNames: Set<string>,
): TriageAlert[] {
  if (supersededFailedRunNames.has(row.run.name)) return [];

  const parsed = buildRunSummaryFromRun(row.run);
  if (parsed.paymentApproved !== false) return [];

  const runId = row.run.name.split("/").pop() ?? row.id;
  const invoiceNumber = parsed.invoiceNumber !== "—" ? parsed.invoiceNumber : "Unknown invoice";
  const poNumber = parsed.poNumber !== "—" ? parsed.poNumber : "—";
  const vendorName = extractVendorFromRun(row.run) ?? "Unknown vendor";
  const materials = extractExtractionFieldValuesFromRun(row.run, [
    "material",
    "material_name",
    "material_number",
  ]);
  const materialName = materials[0] ?? "Unknown material";
  const quantityText = extractQuantityAndUnitTextFromRun(row.run);
  const invoiceDateText = extractInvoiceDateTextFromRun(row.run);
  const totalInvoiceValueText =
    parsed.poTotalValue != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(parsed.poTotalValue)
      : "N/A";

  const out: TriageAlert[] = [];
  for (const key of CHECK_KEYS) {
    if (parsed[key] !== "FAIL") continue;
    const cfg = CHECK_CONFIG[key];
    const id = `triage-${runId}-${key}`;
    out.push({
      id,
      runId,
      createdAt: row.run.updateTime || row.run.createTime || new Date().toISOString(),
      checkKey: key,
      checkLabel: cfg.label,
      invoiceNumber,
      invoiceDateText,
      poNumber,
      vendorName,
      materialName,
      quantityText,
      totalInvoiceValueText,
      recommendation: cfg.recommendation,
      message: `${cfg.label} issue: Invoice ${invoiceNumber} from ${vendorName} for ${materialName} (qty ${quantityText}, value ${totalInvoiceValueText}). ${cfg.recommendation}`,
    });
  }
  return out;
}

export function buildP2pTriageAlerts(rows: KognitosRunRow[], max = 3): TriageAlert[] {
  const superseded = getSupersededFailedRunNames(rows);
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(b.run.updateTime || b.run.createTime || "") -
      Date.parse(a.run.updateTime || a.run.createTime || ""),
  );
  const out: TriageAlert[] = [];
  for (const row of sorted) {
    for (const alert of triageAlertsFromRun(row, superseded)) {
      out.push(alert);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** All triage alerts for runs whose extracted vendor matches this vendor master (id or company name). */
export function buildP2pTriageAlertsForVendor(
  rows: KognitosRunRow[],
  vendor: Pick<Vendor, "company_name" | "vendor_id">,
): TriageAlert[] {
  const superseded = getSupersededFailedRunNames(rows);
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(b.run.updateTime || b.run.createTime || "") -
      Date.parse(a.run.updateTime || a.run.createTime || ""),
  );
  const out: TriageAlert[] = [];
  for (const row of sorted) {
    const extracted = extractVendorFromRun(row.run);
    if (!vendorMasterMatchesExtracted(extracted, vendor)) continue;
    out.push(...triageAlertsFromRun(row, superseded));
  }
  return out.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export const TRIAGE_CHECK_ORDER: TriageCheckKey[] = [...CHECK_KEYS];

export function failedCheckSectionTitle(key: TriageCheckKey): string {
  return `${CHECK_CONFIG[key].label} Failed`;
}
