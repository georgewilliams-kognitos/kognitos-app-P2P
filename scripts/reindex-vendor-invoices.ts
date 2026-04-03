/**
 * One-time backfill: populate `vendor_invoices` from all rows in `kognitos_runs`.
 *
 * Usage (from repo root, reads `.env.local`):
 *   npm run reindex:vendor-invoices
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    console.error(
      "Missing env: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const { reindexAllVendorInvoicesFromDb } = await import(
    "../lib/kognitos/vendor-invoice-index"
  );

  console.log("Reindexing vendor_invoices from kognitos_runs…");
  await reindexAllVendorInvoicesFromDb();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
