import { extractFileRefsFromKognitosPayload } from "@/lib/kognitos/extract-invoice-files";

export type DashboardInvoicePreview = {
  vendorId: string;
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

export function dashboardInvoiceFileHref(
  vendorId: string,
  runId: string,
  payloadRaw: Record<string, unknown>,
  disposition?: "attachment",
): string {
  const inputKey = pickInvoiceInputKeyFromPayload(payloadRaw);
  const q = new URLSearchParams({ vendorId, runId, inputKey });
  if (disposition) q.set("disposition", disposition);
  return `/api/kognitos/invoice-file?${q.toString()}`;
}
