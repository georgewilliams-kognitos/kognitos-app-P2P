/**
 * Dashboard helpers for splitting Kognitos runs (mirrors Vercel-Test home dashboard logic).
 */

import type { KognitosRun } from "@/lib/types";
import type { P2PInsights } from "@/lib/p2p-insights";

export type RunStateLabel =
  | "pending"
  | "executing"
  | "completed"
  | "failed"
  | "stopped"
  | "stopping"
  | "awaitingGuidance"
  | "paused"
  | "unknown";

export function runIdFromName(name: string): string {
  const parts = name.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

export function getRunStateLabel(state: KognitosRun["state"]): RunStateLabel {
  if (!state || typeof state !== "object") return "unknown";
  const s = state as Record<string, unknown>;
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

export function getRunStateDisplayLabel(state: RunStateLabel): string {
  if (state === "awaitingGuidance") return "Awaiting Guidance";
  if (state === "unknown") return "Unknown";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/** True only when `state.completed` is set and no other terminal/active state keys compete. */
export function isCompletedRunFromPayload(run: KognitosRun): boolean {
  const state = run.state as Record<string, unknown> | undefined;
  if (!state || typeof state !== "object") return false;
  if (state.completed == null) return false;
  const hasOtherState = [
    state.failed,
    state.executing,
    state.pending,
    state.stopped,
    state.stopping,
    state.awaitingGuidance,
    state.awaiting_guidance,
    state.paused,
  ].some((v) => v != null);
  return !hasOtherState;
}

export function isCompletedRun(
  run: KognitosRun,
  p2p: P2PInsights | null,
): boolean {
  const runId = runIdFromName(run.name);
  const enriched = p2p?.runs?.find((r) => r.runId === runId);
  if (enriched != null) return enriched.state === "completed";
  return isCompletedRunFromPayload(run);
}

export function getStateReason(state: KognitosRun["state"]): string {
  if (!state || typeof state !== "object") return "—";
  const s = state as Record<string, unknown>;
  let reason = "—";
  const stopped = s.stopped as { reason?: string } | undefined;
  if (stopped?.reason) reason = stopped.reason;
  else {
    const paused = s.paused as { reason?: string } | undefined;
    if (paused?.reason) reason = paused.reason;
    else {
      const failed = s.failed as { description?: string; id?: string } | undefined;
      if (failed?.description) reason = failed.description;
      else if (failed?.id) reason = failed.id;
      else {
        const awaitingGuidance = (s.awaitingGuidance ?? s.awaiting_guidance) as {
          description?: string;
        } | undefined;
        if (awaitingGuidance?.description) reason = awaitingGuidance.description;
      }
    }
  }
  if (reason === "—") return reason;
  if (/service error|book service error/i.test(reason)) return "Service Error";
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

export function formatRunTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function getCompletedTimeFromRun(run: KognitosRun): string | undefined {
  const s = run.state as { update_time?: string; updateTime?: string } | undefined;
  return s?.update_time ?? s?.updateTime;
}

export const DEFAULT_KOGNITOS_WEB_APP_ORIGIN = "https://app.us-1.stg.kognitos.com";

/**
 * Kognitos web UI origin (not the REST API host). Matches Vercel-Test:
 * `NEXT_PUBLIC_KOGNITOS_BASE_URL` with fallback `NEXT_PUBLIC_KOGNITOS_APP_URL`, then staging default.
 */
export function kognitosWebAppBaseUrl(): string {
  const fromEnv =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_KOGNITOS_BASE_URL?.replace(/\/$/, "")) ||
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_KOGNITOS_APP_URL?.replace(/\/$/, "")) ||
    "";
  return fromEnv || DEFAULT_KOGNITOS_WEB_APP_ORIGIN;
}

/** Full URL to open a run in the Kognitos app (`resourceName` is the run `name` from the API). */
export function kognitosRunOpenHref(fullResourceName: string): string {
  const base = kognitosWebAppBaseUrl();
  return `${base}/${fullResourceName}`;
}
