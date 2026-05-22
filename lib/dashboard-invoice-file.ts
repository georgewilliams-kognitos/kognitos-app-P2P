import { extractFileRefsFromKognitosPayload } from "@/lib/kognitos/extract-invoice-files";

export type DashboardInvoicePreview = {
  /** When unknown client-side, iframe still loads via `runId` + `inputKey` lookup. */
  vendorId: string | null;
  runId: string;
  payloadRaw: Record<string, unknown>;
  invoiceNumber: string;
};

export function pickInvoiceInputKeyFromPayload(
  payloadRaw: Record<string, unknown>,
): string {
  const refs = extractFileRefsFromKognitosPayload(payloadRaw);
  for (const r of refs) {
    const rem = r.remote?.trim();
    if (rem && !/^https?:\/\//i.test(rem)) return r.inputKey;
  }
  return "validation_report";
}

/** True when payload has a workspace file ref — likely indexed in `vendor_invoices`. */
export function payloadSuggestsIndexedInvoiceFile(
  payloadRaw: Record<string, unknown>,
): boolean {
  const refs = extractFileRefsFromKognitosPayload(payloadRaw);
  return refs.some((r) => {
    const rem = r.remote?.trim();
    return Boolean(rem && !/^https?:\/\//i.test(rem));
  });
}

export type DashboardInvoiceFileHrefOptions = {
  vendorId?: string | null;
  disposition?: "attachment";
};

/**
 * Query `vendor_invoices` by `runId` + `inputKey` (unique); `vendorId` is optional when
 * the caller only knows the run but the row exists in DB.
 */
export function dashboardInvoiceFileHref(
  runId: string,
  payloadRaw: Record<string, unknown>,
  options?: DashboardInvoiceFileHrefOptions,
): string {
  const inputKey = pickInvoiceInputKeyFromPayload(payloadRaw);
  const q = new URLSearchParams({ runId, inputKey });
  const v = options?.vendorId?.trim();
  if (v) q.set("vendorId", v);
  if (options?.disposition === "attachment") q.set("disposition", "attachment");
  return `/api/kognitos/invoice-file?${q.toString()}`;
}
