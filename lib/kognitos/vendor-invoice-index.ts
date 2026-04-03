import { supabaseAdmin } from "@/lib/supabase";
import {
  buildRunSummaryFromRun,
  extractInvoiceDateTextFromRun,
  extractVendorFromRun,
} from "@/lib/p2p-insights";
import { findVendorByDisplayName } from "@/lib/db";
import { parseKognitosRunPayload } from "./map-run";
import {
  extractFileRefsFromKognitosPayload,
  normalizeKognitosFileIdForDownload,
} from "./extract-invoice-files";

/**
 * Delete and re-insert `vendor_invoices` for one run.
 * Inserts file-backed rows from `file.remote`, or a `validation_report` row (empty `kognitos_file_id`) when the supplier matches but no file refs exist.
 */
export async function reindexVendorInvoicesForRun(
  kognitosRunId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!supabaseAdmin) return;

  const run = parseKognitosRunPayload(payload);
  if (!run) return;

  const vendorName = extractVendorFromRun(run);
  if (!vendorName) return;

  const vendor = await findVendorByDisplayName(vendorName);
  if (!vendor) return;

  const summary = buildRunSummaryFromRun(run);
  const invoiceDateText = extractInvoiceDateTextFromRun(run);
  const invNum =
    summary.invoiceNumber && summary.invoiceNumber !== "—"
      ? summary.invoiceNumber
      : null;
  const invDate =
    invoiceDateText && invoiceDateText !== "—" ? invoiceDateText : null;

  const refs = extractFileRefsFromKognitosPayload(payload);

  await supabaseAdmin
    .from("vendor_invoices")
    .delete()
    .eq("kognitos_run_id", kognitosRunId);

  type Row = {
    kognitos_run_id: string;
    vendor_id: string;
    input_key: string;
    kognitos_file_id: string;
    file_name: string | null;
    invoice_number: string | null;
    invoice_date_text: string | null;
  };
  const byInputKey = new Map<string, Row>();

  for (const r of refs) {
    if (!r.remote || /^https?:\/\//i.test(r.remote)) continue;
    const fileId = normalizeKognitosFileIdForDownload(r.remote);
    if (!fileId) continue;
    byInputKey.set(r.inputKey, {
      kognitos_run_id: kognitosRunId,
      vendor_id: vendor.vendor_id,
      input_key: r.inputKey,
      kognitos_file_id: fileId,
      file_name: r.inlineFileName,
      invoice_number: invNum,
      invoice_date_text: invDate,
    });
  }

  const rows: Row[] =
    byInputKey.size > 0
      ? [...byInputKey.values()]
      : [
          {
            kognitos_run_id: kognitosRunId,
            vendor_id: vendor.vendor_id,
            input_key: "validation_report",
            kognitos_file_id: "",
            file_name: null,
            invoice_number: invNum,
            invoice_date_text: invDate,
          },
        ];

  const { error } = await supabaseAdmin.from("vendor_invoices").insert(rows);
  if (error) {
    console.error("vendor_invoices insert:", error.message);
  }
}

/** Backfill: reindex every run in `kognitos_runs` (service role). */
export async function reindexAllVendorInvoicesFromDb(): Promise<void> {
  if (!supabaseAdmin) return;
  const { data, error } = await supabaseAdmin
    .from("kognitos_runs")
    .select("id, payload");
  if (error) throw error;
  for (const row of data ?? []) {
    const id = String(row.id);
    const payload = row.payload as Record<string, unknown>;
    await reindexVendorInvoicesForRun(id, payload);
  }
}
