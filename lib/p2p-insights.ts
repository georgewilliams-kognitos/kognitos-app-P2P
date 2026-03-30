/**
 * Parse 4-way match run output (markdown_report and payment_recommendation)
 * and aggregate P2P finance metrics.
 */

import type { KognitosRun } from "@/lib/types";

export interface DocumentNumbers {
  poNumber: string;
  invoiceNumber: string;
  goodsReceiptNumber: string;
}

/** Per-check status from Validation Results table (PASS or FAIL). */
export interface ValidationChecks {
  documentMatch: "PASS" | "FAIL";
  quantityAndUnitMatch: "PASS" | "FAIL";
  valueMatch: "PASS" | "FAIL";
  coaValidation: "PASS" | "FAIL";
}

export interface FourWayMatchResult {
  paymentRecommendation: string;
  overallStatus: string;
  validationResult: string;
  checksPassed: number;
  checksTotal: number;
  poNumber?: string;
  invoiceNumber?: string;
  goodsReceiptNumber?: string;
  validationChecks?: Partial<ValidationChecks>;
  /** Total PO/invoice value in dollars (parsed from report). */
  poTotalValue?: number;
}

function getText(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj === "string") return obj;
  if (
    typeof obj === "object" &&
    "text" in obj &&
    typeof (obj as { text: unknown }).text === "string"
  ) {
    return (obj as { text: string }).text;
  }
  return "";
}

/**
 * Parse Validation Results table for per-check PASS/FAIL.
 */
export function parseValidationResults(markdown: string): Partial<ValidationChecks> {
  const result: Partial<ValidationChecks> = {};
  const docMatch = markdown.match(
    /\|\s*Document Match\s*\|[^|]*\|[^|]*\|\s*(PASS|FAIL)\s*/i,
  );
  const qtyMatch = markdown.match(
    /\|\s*Quantity and Unit Match\s*\|[^|]*\|[^|]*\|\s*(PASS|FAIL)\s*/i,
  );
  const valueMatch = markdown.match(
    /\|\s*Value Match\s*\|[^|]*\|[^|]*\|\s*(PASS|FAIL)\s*/i,
  );
  const coaMatch = markdown.match(
    /\|\s*COA Validation\s*\|[^|]*\|[^|]*\|\s*(PASS|FAIL)\s*/i,
  );
  if (docMatch) result.documentMatch = docMatch[1].toUpperCase() as "PASS" | "FAIL";
  if (qtyMatch)
    result.quantityAndUnitMatch = qtyMatch[1].toUpperCase() as "PASS" | "FAIL";
  if (valueMatch) result.valueMatch = valueMatch[1].toUpperCase() as "PASS" | "FAIL";
  if (coaMatch) result.coaValidation = coaMatch[1].toUpperCase() as "PASS" | "FAIL";
  return result;
}

function parsePoTotalValue(markdown: string): number | undefined {
  const patterns = [
    /\*\*Total[^:*]*:\*\*\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\*\*Amount[^:*]*:\*\*\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\*\*PO Value[^:*]*:\*\*\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\*\*Invoice Total[^:*]*:\*\*\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\|\s*Value Match\s*\|[^|]*\|\s*([\d,]+(?:\.\d{2})?)/i,
    /\|\s*Total[^|]*\|\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const re of patterns) {
    const m = markdown.match(re);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      if (!Number.isNaN(num) && num >= 0) return num;
    }
  }
  return undefined;
}

export function parseTransactionSummary(markdown: string): Partial<DocumentNumbers> {
  const result: Partial<DocumentNumbers> = {};
  const poRow = markdown.match(/\|\s*Purchase Order\s*\|\s*([^|\n]+)/i);
  const grRow = markdown.match(/\|\s*Goods Receipt\s*\|\s*([^|\n]+)/i);
  const invRow = markdown.match(/\|\s*Supplier Invoice\s*\|\s*([^|\n]+)/i);
  if (poRow) result.poNumber = poRow[1].trim();
  if (grRow) result.goodsReceiptNumber = grRow[1].trim();
  if (invRow) result.invoiceNumber = invRow[1].trim();
  return result;
}

/**
 * SAP-style "Transaction Summary" table: header row has `| ... | Supplier | Plant |`.
 * The naive regex `| Supplier | X |` matched the header and captured "Plant" (next column name).
 * Here we take the Supplier column index from the header and read values from PO/GR/invoice rows.
 */
function parseSupplierFromSapTransactionSummary(markdown: string): string | null {
  if (!markdown?.trim()) return null;
  const sectionIdx = markdown.indexOf("## Transaction Summary");
  const section = sectionIdx >= 0 ? markdown.slice(sectionIdx) : markdown;
  const lines = section.split(/\r?\n/);
  let supplierCol = -1;
  const counts = new Map<string, number>();

  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 3) continue;

    if (supplierCol < 0) {
      const hasDocType = cells.some((c) => /^document type$/i.test(c));
      const idx = cells.findIndex((c) => /^supplier$/i.test(c));
      if (hasDocType && idx >= 0) supplierCol = idx;
      continue;
    }

    if (cells.slice(1, -1).every((c) => /^[\s\-:]+$/.test(c) || c === ""))
      continue;

    const docKind = cells[1] ?? "";
    if (!/^(Purchase Order|Goods Receipt|Supplier Invoice)$/i.test(docKind))
      continue;

    const val = cells[supplierCol]?.trim() ?? "";
    if (!val || /^plant$/i.test(val)) continue;
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }

  if (counts.size === 0) return null;
  let best = "";
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best || null;
}

/** Best-effort vendor/supplier name from 4-way match markdown tables or labels. */
export function parseVendorNameFromMarkdown(markdown: string): string | null {
  if (!markdown?.trim()) return null;
  const fromSap = parseSupplierFromSapTransactionSummary(markdown);
  if (fromSap) return fromSap;
  const patterns = [
    /\|\s*Vendor\s*\|\s*([^|\n]+)/i,
    /\|\s*Vendor\s*name\s*\|\s*([^|\n]+)/i,
    /\*\*Vendor[^*]*:\*\*\s*(.+?)(?:\n|$)/i,
    /\*\*Supplier[^*]*:\*\*\s*(.+?)(?:\n|$)/i,
  ];
  for (const re of patterns) {
    const m = markdown.match(re);
    if (m?.[1]) {
      const s = m[1].trim();
      if (s.length > 0 && s.length < 256) return s;
    }
  }
  return null;
}

/** Vendor/supplier from user inputs or completed markdown outputs. */
export function extractVendorFromRun(run: KognitosRun): string | null {
  const ui = run.userInputs;
  if (ui && typeof ui === "object") {
    for (const key of [
      "vendor",
      "vendor_name",
      "vendor_id",
      "supplier",
      "supplier_name",
    ]) {
      const v = ui[key]?.trim();
      if (v) return v;
    }
  }
  const outputs = run.state?.completed?.outputs;
  if (outputs && typeof outputs === "object") {
    const md = getText(
      (outputs as Record<string, unknown>).markdown_report,
    );
    const fromMd = parseVendorNameFromMarkdown(md);
    if (fromMd) return fromMd;
  }
  return null;
}

export function parseMarkdownReport(markdown: string): Partial<FourWayMatchResult> {
  const result: Partial<FourWayMatchResult> = {};
  const overallStatus = markdown.match(/\*\*Overall Status:\*\*\s*(\S+)/i);
  const validationResult = markdown.match(/\*\*Validation Result:\*\*\s*(\w+)/i);
  const checksPassed = markdown.match(/\*\*Checks Passed:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
  const paymentRec = markdown.match(/\*\*Payment Recommendation:\*\*\s*(.+?)(?:\n|$)/i);

  if (overallStatus) result.overallStatus = overallStatus[1].trim();
  if (validationResult) result.validationResult = validationResult[1].trim().toUpperCase();
  if (checksPassed) {
    result.checksPassed = parseInt(checksPassed[1], 10);
    result.checksTotal = parseInt(checksPassed[2], 10);
  }
  if (paymentRec) result.paymentRecommendation = paymentRec[1].trim();

  const docs = parseTransactionSummary(markdown);
  if (docs.poNumber) result.poNumber = docs.poNumber;
  if (docs.invoiceNumber) result.invoiceNumber = docs.invoiceNumber;
  if (docs.goodsReceiptNumber) result.goodsReceiptNumber = docs.goodsReceiptNumber;

  const checks = parseValidationResults(markdown);
  if (Object.keys(checks).length > 0) result.validationChecks = checks;

  const poTotal = parsePoTotalValue(markdown);
  if (poTotal != null) result.poTotalValue = poTotal;

  return result;
}

export function extractFourWayMatchFromRun(run: {
  state?: {
    completed?: {
      outputs?: Record<string, unknown>;
    };
  };
}): FourWayMatchResult | null {
  const outputs = run.state?.completed?.outputs;
  if (!outputs) return null;

  const paymentRec = getText(outputs.payment_recommendation);
  const markdown = getText(outputs.markdown_report);

  const fromMarkdown = parseMarkdownReport(markdown);
  const recommendation = paymentRec || fromMarkdown.paymentRecommendation;
  if (!recommendation && !fromMarkdown.validationResult) return null;

  return {
    paymentRecommendation: recommendation ?? fromMarkdown.paymentRecommendation ?? "—",
    overallStatus: fromMarkdown.overallStatus ?? "—",
    validationResult: fromMarkdown.validationResult ?? "—",
    checksPassed: fromMarkdown.checksPassed ?? 0,
    checksTotal: fromMarkdown.checksTotal ?? 0,
    poNumber: fromMarkdown.poNumber,
    invoiceNumber: fromMarkdown.invoiceNumber,
    goodsReceiptNumber: fromMarkdown.goodsReceiptNumber,
    validationChecks: fromMarkdown.validationChecks,
    poTotalValue: fromMarkdown.poTotalValue,
  };
}

export interface RunSummary {
  runId: string;
  name: string;
  createTime?: string;
  updateTime?: string;
  completedTime?: string;
  state: string;
  poNumber: string;
  invoiceNumber: string;
  goodsReceiptNumber: string;
  documentMatch?: "PASS" | "FAIL";
  quantityAndUnitMatch?: "PASS" | "FAIL";
  valueMatch?: "PASS" | "FAIL";
  coaValidation?: "PASS" | "FAIL";
  paymentApproved?: boolean;
  poTotalValue?: number;
}

export interface CheckPercentages {
  documentMatch: number;
  quantityAndUnitMatch: number;
  valueMatch: number;
  coaValidation: number;
}

export interface P2PInsights {
  runsAnalyzed: number;
  paymentRecommendations: Record<string, number>;
  paymentApproveCount: number;
  paymentRejectCount: number;
  totalApprovedValue: number;
  totalRejectedValue: number;
  validationPass: number;
  validationFail: number;
  totalChecksPassed: number;
  totalChecksPossible: number;
  overallStatuses: Record<string, number>;
  checkPercentages: CheckPercentages;
  runs: RunSummary[];
}

const CHECK_KEYS: (keyof ValidationChecks)[] = [
  "documentMatch",
  "quantityAndUnitMatch",
  "valueMatch",
  "coaValidation",
];

export function aggregateResults(
  results: FourWayMatchResult[],
  runSummaries: RunSummary[] = [],
): P2PInsights {
  const paymentRecommendations: Record<string, number> = {};
  let paymentApproveCount = 0;
  let paymentRejectCount = 0;
  let totalApprovedValue = 0;
  let totalRejectedValue = 0;
  const overallStatuses: Record<string, number> = {};
  let validationPass = 0;
  let validationFail = 0;
  let totalChecksPassed = 0;
  let totalChecksPossible = 0;

  const checkPassCounts: Record<keyof ValidationChecks, number> = {
    documentMatch: 0,
    quantityAndUnitMatch: 0,
    valueMatch: 0,
    coaValidation: 0,
  };
  const checkTotals: Record<keyof ValidationChecks, number> = {
    documentMatch: 0,
    quantityAndUnitMatch: 0,
    valueMatch: 0,
    coaValidation: 0,
  };

  for (const r of results) {
    const rec = r.paymentRecommendation || "—";
    paymentRecommendations[rec] = (paymentRecommendations[rec] ?? 0) + 1;
    const status = r.overallStatus || "—";
    overallStatuses[status] = (overallStatuses[status] ?? 0) + 1;
    if (r.validationResult === "PASS") validationPass += 1;
    else if (r.validationResult === "FAIL") validationFail += 1;
    totalChecksPassed += r.checksPassed;
    totalChecksPossible += r.checksTotal;

    const vc = r.validationChecks;
    if (vc) {
      for (const key of CHECK_KEYS) {
        const st = vc[key];
        if (st) {
          checkTotals[key] += 1;
          if (st === "PASS") checkPassCounts[key] += 1;
        }
      }
    }
  }

  const checkPercentages: CheckPercentages = {
    documentMatch:
      checkTotals.documentMatch > 0
        ? Math.round((100 * checkPassCounts.documentMatch) / checkTotals.documentMatch)
        : 0,
    quantityAndUnitMatch:
      checkTotals.quantityAndUnitMatch > 0
        ? Math.round(
            (100 * checkPassCounts.quantityAndUnitMatch) /
              checkTotals.quantityAndUnitMatch,
          )
        : 0,
    valueMatch:
      checkTotals.valueMatch > 0
        ? Math.round((100 * checkPassCounts.valueMatch) / checkTotals.valueMatch)
        : 0,
    coaValidation:
      checkTotals.coaValidation > 0
        ? Math.round((100 * checkPassCounts.coaValidation) / checkTotals.coaValidation)
        : 0,
  };

  for (const run of runSummaries) {
    const value = run.poTotalValue ?? 0;
    if (run.paymentApproved === true) {
      paymentApproveCount += 1;
      totalApprovedValue += value;
    } else if (run.paymentApproved === false) {
      paymentRejectCount += 1;
      totalRejectedValue += value;
    }
  }

  return {
    runsAnalyzed: results.length,
    paymentRecommendations,
    paymentApproveCount,
    paymentRejectCount,
    totalApprovedValue,
    totalRejectedValue,
    validationPass,
    validationFail,
    totalChecksPassed,
    totalChecksPossible,
    overallStatuses,
    checkPercentages,
    runs: runSummaries,
  };
}

export function getStateLabel(run: { state?: Record<string, unknown> }): string {
  const s = run.state;
  if (!s || typeof s !== "object") return "unknown";
  if (s.pending !== undefined) return "pending";
  if (s.executing !== undefined) return "executing";
  if (s.completed !== undefined) return "completed";
  if (s.failed !== undefined) return "failed";
  if (s.stopped !== undefined) return "stopped";
  if (s.stopping !== undefined) return "stopping";
  if (s.awaitingGuidance !== undefined || s.awaiting_guidance !== undefined)
    return "awaitingGuidance";
  if (s.paused !== undefined) return "paused";
  return "unknown";
}

export function buildRunSummaryFromRun(run: KognitosRun): RunSummary {
  const runId = run.name.split("/").pop() ?? run.name;
  const parsed = extractFourWayMatchFromRun(run);
  let paymentApproved: boolean | undefined;
  if (parsed) {
    const rec = parsed.paymentRecommendation.trim().toUpperCase();
    paymentApproved = rec.includes("APPROVE") && !rec.includes("REJECT");
  }

  return {
    runId,
    name: run.name,
    createTime: run.createTime,
    updateTime: run.updateTime,
    completedTime: run.updateTime,
    state: getStateLabel(run),
    poNumber: parsed?.poNumber ?? "—",
    invoiceNumber: parsed?.invoiceNumber ?? "—",
    goodsReceiptNumber: parsed?.goodsReceiptNumber ?? "—",
    documentMatch: parsed?.validationChecks?.documentMatch,
    quantityAndUnitMatch: parsed?.validationChecks?.quantityAndUnitMatch,
    valueMatch: parsed?.validationChecks?.valueMatch,
    coaValidation: parsed?.validationChecks?.coaValidation,
    paymentApproved,
    poTotalValue: parsed?.poTotalValue,
  };
}
