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

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!s || s === "[object Object]") return null;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

function readStringLike(value: unknown, depth = 0): string | null {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    return s && s !== "[object Object]" ? s : null;
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of [
    "stringValue",
    "text",
    "value",
    "normalizedValue",
    "normalized_value",
    "extractedValue",
    "extracted_value",
    "name",
    "displayName",
    "display_name",
    "content",
  ]) {
    if (!(key in obj)) continue;
    const hit = readStringLike(obj[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

function collectStringValues(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || value == null) return;
  const s = readStringLike(value);
  if (s) {
    out.push(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      collectStringValues(child, out, depth + 1);
    }
  }
}

/** Decode Kognitos typed value shape (`dictionary.entries`, `list.items`, `text`, etc.) to plain JS. */
function decodeTypedValue(node: unknown, depth = 0): unknown {
  if (depth > 8 || node == null || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;

  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.stringValue === "string") return obj.stringValue;
  if (obj.number && typeof obj.number === "object") {
    const n = obj.number as Record<string, unknown>;
    if (typeof n.lo === "number") return n.lo;
  }
  if (typeof obj.bool === "boolean") return obj.bool;

  if (obj.list && typeof obj.list === "object") {
    const items = (obj.list as { items?: unknown[] }).items;
    if (Array.isArray(items)) return items.map((it) => decodeTypedValue(it, depth + 1));
  }

  if (obj.dictionary && typeof obj.dictionary === "object") {
    const entries = (obj.dictionary as { entries?: unknown[] }).entries;
    if (Array.isArray(entries)) {
      const out: Record<string, unknown> = {};
      for (const e of entries) {
        if (!e || typeof e !== "object") continue;
        const er = e as Record<string, unknown>;
        const keyObj = er.key as Record<string, unknown> | undefined;
        const key =
          (keyObj && (decodeTypedValue(keyObj, depth + 1) as string)) ||
          "";
        if (!key) continue;
        out[key] = decodeTypedValue(er.value, depth + 1);
      }
      return out;
    }
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = decodeTypedValue(v, depth + 1);
  return out;
}

function findVendorNameField(node: unknown, depth = 0): string | null {
  if (depth > 8 || node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findVendorNameField(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  const direct = bestString(obj.vendor_name);
  if (direct && isLikelyVendorName(direct)) return direct;

  const name = bestString(obj.name);
  if (name && /^vendor[_\s-]?name$/i.test(name)) {
    const valueCandidates: string[] = [];
    collectStringValues(obj.values, valueCandidates);
    collectStringValues(obj.value, valueCandidates);
    collectStringValues(obj.text, valueCandidates);
    collectStringValues(obj.normalizedValue, valueCandidates);
    collectStringValues(obj.extractedValue, valueCandidates);
    for (const c of valueCandidates) {
      if (isLikelyVendorName(c)) return c.trim();
    }
    const candidate =
      bestString(obj.value) ??
      bestString(obj.text) ??
      bestString(obj.normalizedValue) ??
      bestString(obj.extractedValue);
    if (candidate && isLikelyVendorName(candidate)) return candidate;
  }

  for (const child of Object.values(obj)) {
    const hit = findVendorNameField(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function bestString(v: unknown): string | null {
  const s = (readStringLike(v) ?? getText(v)).trim();
  if (!s || s === "[object Object]") return null;
  return s;
}

function isLikelyVendorName(value: string): boolean {
  const s = value.trim();
  if (!s || s.length > 256) return false;
  if (/^\d+$/.test(s)) return false; // pure ids/codes
  if (/^(document|documents|supplier|vendor|plant|invoice|po)$/i.test(s))
    return false;
  return true;
}

/** Deep-search object for vendor/supplier-like keys (document extraction payloads). */
function findVendorLikeValueDeep(node: unknown): string | null {
  const targetKey = /(vendor|supplier)/i;
  const skipKey = /(id|number|code|plant|address|city|zip|postal|email|phone)$/i;
  const labelKey = /(field|label|name|key|title)$/i;
  const valueKey = /(value|text|content|normalized|extracted)/i;

  function walk(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;

    // Strong signal: a field/label says vendor/supplier and a sibling contains the value.
    let hasVendorLabel = false;
    for (const [k, v] of Object.entries(obj)) {
      if (!labelKey.test(k)) continue;
      const label = bestString(v);
      if (label && /(vendor|supplier)/i.test(label) && !skipKey.test(label)) {
        hasVendorLabel = true;
        break;
      }
    }
    if (hasVendorLabel) {
      for (const [k, v] of Object.entries(obj)) {
        if (!valueKey.test(k) && !/^(result|output|raw|data)$/i.test(k)) continue;
        const candidate = bestString(v);
        if (candidate && isLikelyVendorName(candidate)) return candidate;
      }
    }

    // Prefer explicit name-ish keys first.
    for (const [k, v] of Object.entries(obj)) {
      if (!targetKey.test(k) || skipKey.test(k)) continue;
      const direct = bestString(v);
      if (direct && isLikelyVendorName(direct)) return direct;
      if (typeof v === "object" && v != null) {
        const nestedName =
          bestString((v as Record<string, unknown>).name) ??
          bestString((v as Record<string, unknown>).value) ??
          bestString((v as Record<string, unknown>).text);
        if (nestedName && isLikelyVendorName(nestedName)) return nestedName;
      }
    }

    // Fallback: recurse through children.
    for (const child of Object.values(obj)) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  }

  return walk(node);
}

/** Vendor from document processing output (`idp_extraction_results`). */
function extractVendorFromExtractionOutputs(
  outputs: Record<string, unknown>,
): string | null {
  const raw = parseJsonIfString(outputs.idp_extraction_results);
  if (raw == null) return null;
  const decoded = decodeTypedValue(raw);

  const fromDecodedVendorName = findVendorNameField(decoded);
  if (fromDecodedVendorName) return fromDecodedVendorName;

  // Explicit contract from extraction payload: `vendor_name` holds vendor name.
  const vendorNameCandidates: string[] = [];
  (function walk(node: unknown, depth = 0) {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (/^vendor[_\s-]?name$/i.test(k)) {
        collectStringValues(v, vendorNameCandidates);
      } else {
        walk(v, depth + 1);
      }
    }
  })(decoded);
  for (const c of vendorNameCandidates) {
    if (isLikelyVendorName(c)) return c.trim();
  }

  return findVendorLikeValueDeep(decoded);
}

function collectNamedFieldValues(
  node: unknown,
  matcher: (name: string) => boolean,
  out: string[],
  depth = 0,
): void {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectNamedFieldValues(item, matcher, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const name = bestString(obj.name);
  if (name && matcher(name)) {
    collectStringValues(obj.values, out);
    collectStringValues(obj.value, out);
    collectStringValues(obj.text, out);
    collectStringValues(obj.normalizedValue, out);
    collectStringValues(obj.extractedValue, out);
  }
  for (const child of Object.values(obj)) {
    collectNamedFieldValues(child, matcher, out, depth + 1);
  }
}

export function extractExtractionFieldValuesFromRun(
  run: KognitosRun,
  fieldNames: string[],
): string[] {
  const outputs = run.state?.completed?.outputs;
  if (!outputs || typeof outputs !== "object") return [];
  const raw = parseJsonIfString(
    (outputs as Record<string, unknown>).idp_extraction_results,
  );
  if (raw == null) return [];
  const decoded = decodeTypedValue(raw);
  const wanted = new Set(fieldNames.map((n) => n.toLowerCase()));
  const values: string[] = [];
  collectNamedFieldValues(
    decoded,
    (name) => wanted.has(name.trim().toLowerCase()),
    values,
  );
  return values
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v !== "[object Object]");
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
    if (!val || /^plant$/i.test(val) || /^\d+$/.test(val)) continue;
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
  const outputs = run.state?.completed?.outputs;
  if (outputs && typeof outputs === "object") {
    const fromExtraction = extractVendorFromExtractionOutputs(
      outputs as Record<string, unknown>,
    );
    if (fromExtraction) return fromExtraction;
  }

  const ui = run.userInputs;
  if (ui && typeof ui === "object") {
    for (const key of [
      "vendor",
      "vendor_name",
      "supplier",
      "supplier_name",
    ]) {
      const v = ui[key]?.trim();
      if (v && isLikelyVendorName(v)) return v;
    }
  }
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
