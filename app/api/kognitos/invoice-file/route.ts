import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { downloadInvoiceFileWithWorkspaceFallback } from "@/lib/kognitos/client-core";

export const runtime = "nodejs";

/**
 * Proxy PDF (or other) bytes from Kognitos Files API (workspace `{file}:download` first, then org).
 * Validates the file belongs to `vendor_invoices` for the given run + input key (+ optional vendor_id filter).
 *
 * Query: runId, inputKey — required. vendorId optional (`vendor_invoices` is unique on run + input key).
 * Optional: disposition=attachment for downloads.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vendorId = url.searchParams.get("vendorId")?.trim() || null;
  const runId = url.searchParams.get("runId");
  const inputKey = url.searchParams.get("inputKey");
  const disposition = url.searchParams.get("disposition");

  if (!runId?.trim() || !inputKey?.trim()) {
    return NextResponse.json(
      {
        error: "missing_params",
        message: "runId and inputKey are required.",
      },
      { status: 400 },
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 503 },
    );
  }

  let invQuery = supabaseAdmin
    .from("vendor_invoices")
    .select("*")
    .eq("kognitos_run_id", runId.trim())
    .eq("input_key", inputKey.trim());
  if (vendorId) invQuery = invQuery.eq("vendor_id", vendorId);
  const { data, error } = await invQuery.maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const fileId = String(data.kognitos_file_id ?? "").trim();
  if (!fileId) {
    return NextResponse.json(
      {
        error: "no_file",
        message:
          "This row is validation metadata only; no PDF was indexed for this run (no file.remote on the automation input).",
      },
      { status: 404 },
    );
  }
  const safeName = (data.file_name as string | null)?.replace(/[^\w.\- ()[\]]+/g, "_") || "document.pdf";

  try {
    const upstream = await downloadInvoiceFileWithWorkspaceFallback(fileId);
    const headers = new Headers();
    let contentType = upstream.headers.get("content-type")?.trim() || "";
    if (
      (!contentType || contentType === "application/octet-stream") &&
      /\.pdf$/i.test(safeName)
    ) {
      contentType = "application/pdf";
    }
    headers.set("content-type", contentType || "application/octet-stream");

    // Do not forward upstream Content-Disposition: Kognitos often sends `attachment`, which
    // forces a file download and breaks <iframe> / inline PDF preview in the vendor UI.
    const mode = disposition === "attachment" ? "attachment" : "inline";
    headers.set(
      "content-disposition",
      `${mode}; filename="${safeName}"`,
    );

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "download_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
