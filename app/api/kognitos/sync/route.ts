import { NextResponse } from "next/server";
import { runKognitosRefresh } from "@/lib/kognitos/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const hasEnv =
    process.env.KOGNITOS_BASE_URL &&
    (process.env.KOGNITOS_API_KEY || process.env.KOGNITOS_PAT) &&
    (process.env.KOGNITOS_ORGANIZATION_ID || process.env.KOGNITOS_ORG_ID) &&
    process.env.KOGNITOS_WORKSPACE_ID &&
    process.env.KOGNITOS_AUTOMATION_ID;

  if (!hasEnv) {
    return NextResponse.json(
      {
        ok: false,
        error: "kognitos_env_missing",
        message:
          "Configure KOGNITOS_BASE_URL, KOGNITOS_API_KEY (or KOGNITOS_PAT), organization, workspace, and automation IDs.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await runKognitosRefresh();
    if (!result.ok) {
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
