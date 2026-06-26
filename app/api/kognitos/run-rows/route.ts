import { NextResponse } from "next/server";
import { fetchKognitosRunRowsFromSupabase } from "@/lib/kognitos/run-rows-server";

export async function GET() {
  try {
    const rows = await fetchKognitosRunRowsFromSupabase();
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
