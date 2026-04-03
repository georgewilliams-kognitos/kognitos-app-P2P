import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { downloadOrganizationFile } from "@/lib/kognitos/client-core";

export const runtime = "nodejs";

/**
 * Proxy PDF (or other) bytes from Kognitos Files API. Validates the file belongs to
 * `vendor_invoices` for the given vendor + run + input key.
 *
 * Query: vendorId, runId, inputKey — required.
 * Optional: disposition=attachment for downloads.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vendorId = url.searchParams.get("vendorId");
  const runId = url.searchParams.get("runId");
  const inputKey = url.searchParams.get("inputKey");
  const disposition = url.searchParams.get("disposition");

  if (!vendorId?.trim() || !runId?.trim() || !inputKey?.trim()) {
    return NextResponse.json(
      { error: "missing_params", message: "vendorId, runId, and inputKey are required." },
      { status: 400 },
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 503 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("vendor_invoices")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("kognitos_run_id", runId)
    .eq("input_key", inputKey)
    .maybeSingle();

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
    const upstream = await downloadOrganizationFile(fileId);
    const headers = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    else headers.set("content-type", "application/octet-stream");

    const upstreamCd = upstream.headers.get("content-disposition");
    if (upstreamCd) {
      headers.set("content-disposition", upstreamCd);
    } else {
      const mode = disposition === "attachment" ? "attachment" : "inline";
      headers.set(
        "content-disposition",
        `${mode}; filename="${safeName}"`,
      );
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "download_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
