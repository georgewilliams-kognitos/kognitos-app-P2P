import type { KognitosRunRow } from "@/lib/db";
import {
  buildRunSummaryFromRun,
  extractExtractionFieldValuesFromRun,
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
  vendorName: string;
  materialName: string;
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

export function buildP2pTriageAlerts(rows: KognitosRunRow[], max = 3): TriageAlert[] {
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(b.run.updateTime || b.run.createTime || "") -
      Date.parse(a.run.updateTime || a.run.createTime || ""),
  );
  const out: TriageAlert[] = [];

  for (const row of sorted) {
    const parsed = buildRunSummaryFromRun(row.run);
    if (parsed.paymentApproved !== false) continue;

    const runId = row.run.name.split("/").pop() ?? row.id;
    const invoiceNumber = parsed.invoiceNumber || "Unknown invoice";
    const vendorName = extractVendorFromRun(row.run) ?? "Unknown vendor";
    const materials = extractExtractionFieldValuesFromRun(row.run, [
      "material",
      "material_name",
      "material_number",
    ]);
    const counts = extractExtractionFieldValuesFromRun(row.run, [
      "count",
      "quantity",
      "qty",
    ]);
    const materialName = materials[0] ?? "Unknown material";
    const quantityText = counts[0] ?? "N/A";
    const totalInvoiceValueText =
      parsed.poTotalValue != null
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(parsed.poTotalValue)
        : "N/A";

    const checks: TriageCheckKey[] = [
      "documentMatch",
      "quantityAndUnitMatch",
      "valueMatch",
      "coaValidation",
    ];
    for (const key of checks) {
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
        vendorName,
        materialName,
        totalInvoiceValueText,
        recommendation: cfg.recommendation,
        message: `${cfg.label} issue: Invoice ${invoiceNumber} from ${vendorName} for ${materialName} (qty ${quantityText}, value ${totalInvoiceValueText}). ${cfg.recommendation}`,
      });
      if (out.length >= max) return out;
    }
  }

  return out;
}
