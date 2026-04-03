/**
 * Re-download full run JSON from Kognitos (GET Run) for every row in kognitos_runs
 * so payloads include structured user_inputs / file.remote. Then reindex vendor_invoices.
 *
 * Usage: npm run refresh:run-payloads
 *
 * Requires KOGNITOS_* and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { refreshAllRunPayloadsFromKognitos } = await import(
    "../lib/kognitos/refresh-run-payloads"
  );
  console.log("Refreshing kognitos_runs.payload from Kognitos API…");
  const r = await refreshAllRunPayloadsFromKognitos();
  console.log(r);
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
