import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);

  const tableCounts: Record<string, number | string> = {};
  let queryError: string | null = null;
  let available = false;

  if (configured && url && anon) {
    try {
      const sb = createClient(url, anon);
      for (const table of ["vendors", "kognitos_runs", "vendor_invoices"]) {
        const { count, error } = await sb
          .from(table)
          .select("*", { count: "exact", head: true });
        if (error) {
          tableCounts[table] = `error:${error.code ?? error.message}`;
        } else {
          tableCounts[table] = count ?? 0;
          if (table === "vendors") available = true;
        }
      }
    } catch (e) {
      queryError = e instanceof Error ? e.message : String(e);
    }
  } else {
    queryError = "skipped:not_configured";
  }

  return NextResponse.json({
    configured,
    available,
    tableCounts,
    queryError,
  });
}
