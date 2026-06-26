/**
 * Strip heavy Kognitos run JSON before sending to the browser.
 * Keeps only fields needed for invoice file link resolution.
 */
import type { KognitosRun } from "@/lib/types";

export function slimKognitosPayloadForClient(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const slim: Record<string, unknown> = {};
  const ui = payload.userInputs ?? payload.user_inputs;
  if (ui != null) slim.userInputs = ui;
  const steps = payload.executableSteps ?? payload.executable_steps;
  if (steps && typeof steps === "object" && !Array.isArray(steps)) {
    const inputs = (steps as Record<string, unknown>).inputs;
    if (inputs != null) slim.executableSteps = { inputs };
  }
  return slim;
}

/** Remove large output blobs from run state before JSON transfer to the browser. */
export function slimRunForClientTransport(run: KognitosRun): KognitosRun {
  const completed = run.state?.completed;
  if (!completed?.outputs || typeof completed.outputs !== "object") return run;
  const outputs = { ...(completed.outputs as Record<string, unknown>) };
  delete outputs.markdown_report;
  delete outputs.idp_extraction_results;
  return {
    ...run,
    state: {
      ...run.state,
      completed: {
        ...completed,
        outputs: outputs as Record<string, string>,
      },
    },
  };
}
