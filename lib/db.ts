/**
 * Data access layer — all reads and writes go through Supabase.
 *
 * CUSTOMIZE: Rename table names in the .from() calls to match your Supabase schema.
 * Each fetcher maps 1-to-1 with a database table.
 */

import { supabase } from "./supabase";
import type {
  Request,
  User,
  Document,
  Comment,
  AuditEvent,
  Notification,
  Rule,
  Vendor,
  VendorProduct,
  VendorInvoice,
  KognitosRun,
  KognitosInsights,
} from "./types";
import { parseKognitosRunPayload } from "./kognitos/map-run";
import type { P2PInsights } from "./p2p-insights";

/** Throws if Supabase client is not configured. */
function sb() {
  if (!supabase)
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  return supabase;
}

// ── Full-table fetchers ────────────────────────────────────────

export async function getAllRequests(): Promise<Request[]> {
  const { data, error } = await sb().from("requests").select("*");
  if (error) throw error;
  return data as Request[];
}

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await sb().from("users").select("*");
  if (error) throw error;
  return data as User[];
}

export async function getAllDocuments(): Promise<Document[]> {
  const { data, error } = await sb().from("documents").select("*");
  if (error) throw error;
  return data as Document[];
}

export async function getAllComments(): Promise<Comment[]> {
  const { data, error } = await sb().from("comments").select("*");
  if (error) throw error;
  return data as Comment[];
}

export async function getAllAuditEvents(): Promise<AuditEvent[]> {
  const { data, error } = await sb().from("audit_events").select("*");
  if (error) throw error;
  return data as AuditEvent[];
}

export async function getAllNotifications(): Promise<Notification[]> {
  const { data, error } = await sb().from("notifications").select("*");
  if (error) throw error;
  return data as Notification[];
}

export async function getAllRules(): Promise<Rule[]> {
  const { data, error } = await sb().from("rules").select("*");
  if (error) throw error;
  return data as Rule[];
}

export async function getAllVendors(): Promise<Vendor[]> {
  const { data, error } = await sb()
    .from("vendors")
    .select(
      [
        "vendor_id",
        "company_name",
        "vendor_type",
        "qualification_status",
        "primary_contact_name",
        "primary_contact_email",
        "primary_contact_phone",
        "city",
        "state_province",
        "country",
        "region",
        "contract_end_date",
        "annual_spend_usd",
        "payment_terms_days",
        "currency",
        "incoterms",
        "preferred_vendor",
        "vendor_risk_rating",
        "updated_at",
      ].join(","),
    )
    .order("company_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Vendor[];
}

// ── Single-record fetchers ─────────────────────────────────────
// CUSTOMIZE: Rename "requests" to your entity table name.

export async function getRequestById(id: string): Promise<Request | undefined> {
  const { data, error } = await sb()
    .from("requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return undefined;
  return data as Request;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const { data, error } = await sb()
    .from("users")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return undefined;
  return data as User;
}

export async function getRuleById(id: string): Promise<Rule | undefined> {
  const { data, error } = await sb()
    .from("rules")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return undefined;
  return data as Rule;
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
  const { data, error } = await sb()
    .from("vendors")
    .select(
      [
        "vendor_id",
        "company_name",
        "vendor_type",
        "qualification_status",
        "primary_contact_name",
        "primary_contact_email",
        "primary_contact_phone",
        "city",
        "state_province",
        "country",
        "region",
        "contract_end_date",
        "annual_spend_usd",
        "payment_terms_days",
        "currency",
        "incoterms",
        "preferred_vendor",
        "vendor_risk_rating",
        "updated_at",
      ].join(","),
    )
    .eq("vendor_id", id)
    .single();
  if (error) return undefined;
  return data as unknown as Vendor;
}

// ── Relational fetchers ────────────────────────────────────────
// CUSTOMIZE: Adjust foreign-key column names to match your schema.

export async function getDocumentsForRequest(requestId: string): Promise<Document[]> {
  const { data, error } = await sb()
    .from("documents")
    .select("*")
    .eq("request_id", requestId);
  if (error) throw error;
  return data as Document[];
}

export async function getCommentsForRequest(requestId: string): Promise<Comment[]> {
  const { data, error } = await sb()
    .from("comments")
    .select("*")
    .eq("request_id", requestId);
  if (error) throw error;
  return data as Comment[];
}

export async function getAuditEventsForRequest(requestId: string): Promise<AuditEvent[]> {
  const { data, error } = await sb()
    .from("audit_events")
    .select("*")
    .eq("request_id", requestId);
  if (error) throw error;
  return data as AuditEvent[];
}

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  const { data, error } = await sb()
    .from("notifications")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return data as Notification[];
}

export async function getProductsForVendor(
  vendorId: string,
): Promise<VendorProduct[]> {
  const { data, error } = await sb()
    .from("vendor_products")
    .select(
      [
        "product_id",
        "vendor_id",
        "product_name",
        "catalog_number",
        "cas_number",
        "product_type",
        "product_category",
        "unit_of_measure",
        "minimum_order_quantity",
        "price_per_unit_usd",
        "last_purchased_price",
        "last_purchased_date",
        "lead_time_days",
        "availability_status",
        "shipping_class",
        "temperature_requirement",
        "packaging_options",
        "ships_from_country",
        "gmp_manufactured",
        "coa_available",
        "msds_available",
        "dmf_number",
        "cep_number",
        "notes",
        "updated_at",
      ].join(","),
    )
    .eq("vendor_id", vendorId)
    .order("product_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as VendorProduct[];
}

function normalizeLooseText(value: string) {
  return value
    .toLowerCase()
    .replace(/^invoice\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function findVendorByDisplayName(
  displayName: string,
): Promise<Vendor | null> {
  const trimmed = displayName.trim();
  if (!trimmed) return null;

  const vendors = await getAllVendors();
  const byVendorId = vendors.find((v) => v.vendor_id === trimmed);
  if (byVendorId) return byVendorId;

  const normalized = normalizeLooseText(displayName);
  if (!normalized) return null;

  const exact = vendors.find(
    (v) => normalizeLooseText(v.company_name) === normalized,
  );
  if (exact) return exact;

  const fuzzy = vendors.find((v) => {
    const candidate = normalizeLooseText(v.company_name);
    return candidate.includes(normalized) || normalized.includes(candidate);
  });

  return fuzzy ?? null;
}

export async function findVendorForMaterialName(
  materialName: string,
): Promise<{ vendor: Vendor; product: VendorProduct } | null> {
  const normalized = normalizeLooseText(materialName);
  if (!normalized) return null;

  const { data, error } = await sb()
    .from("vendor_products")
    .select(
      [
        "product_id",
        "vendor_id",
        "product_name",
        "catalog_number",
        "cas_number",
        "product_type",
        "product_category",
        "unit_of_measure",
        "minimum_order_quantity",
        "price_per_unit_usd",
        "last_purchased_price",
        "last_purchased_date",
        "lead_time_days",
        "availability_status",
        "shipping_class",
        "temperature_requirement",
        "packaging_options",
        "ships_from_country",
        "gmp_manufactured",
        "coa_available",
        "msds_available",
        "dmf_number",
        "cep_number",
        "notes",
        "updated_at",
      ].join(","),
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const products = (data ?? []) as unknown as VendorProduct[];
  const product =
    products.find((p) => normalizeLooseText(p.product_name) === normalized) ??
    products.find((p) => {
      const productNorm = normalizeLooseText(p.product_name);
      const catalogNorm = normalizeLooseText(p.catalog_number ?? "");
      return (
        productNorm.includes(normalized) ||
        normalized.includes(productNorm) ||
        (catalogNorm.length > 0 &&
          (catalogNorm.includes(normalized) || normalized.includes(catalogNorm)))
      );
    });

  if (!product) return null;
  const vendor = await getVendorById(product.vendor_id);
  if (!vendor) return null;
  return { vendor, product };
}

// ── Write functions ────────────────────────────────────────────
// CUSTOMIZE: Rename "requests" to your entity table name.

export async function insertRequest(entity: Omit<Request, "created_at" | "updated_at">): Promise<Request> {
  const { data, error } = await sb().from("requests").insert(entity).select().single();
  if (error) throw error;
  return data as Request;
}

export async function updateRequest(id: string, updates: Partial<Request>): Promise<Request> {
  const { data, error } = await sb()
    .from("requests")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Request;
}

export async function insertAuditEvent(event: Omit<AuditEvent, "created_at">): Promise<AuditEvent> {
  const { data, error } = await sb().from("audit_events").insert(event).select().single();
  if (error) throw error;
  return data as AuditEvent;
}

export async function insertComment(comment: Omit<Comment, "created_at">): Promise<Comment> {
  const { data, error } = await sb().from("comments").insert(comment).select().single();
  if (error) throw error;
  return data as Comment;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await sb()
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);
  if (error) throw error;
}



/** Invoices (indexed file metadata) for a vendor, newest first. */
export async function listVendorInvoicesForVendor(
  vendorId: string,
): Promise<VendorInvoice[]> {
  const { data, error } = await sb()
    .from("vendor_invoices")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorInvoice[];
}

// ── Kognitos (reads from synced Supabase tables) ───────────────

export async function getKognitosRunFromDb(
  runId: string,
): Promise<KognitosRun | null> {
  const { data, error } = await sb()
    .from("kognitos_runs")
    .select("payload")
    .eq("id", runId)
    .single();
  if (error || !data) return null;
  return parseKognitosRunPayload(data.payload);
}

export async function getKognitosInsightsCacheFromDb(): Promise<{
  insights: KognitosInsights | null;
  p2p: P2PInsights | null;
}> {
  const { data, error } = await sb()
    .from("kognitos_insights_cache")
    .select("insights_json, p2p_summary")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) return { insights: null, p2p: null };
  return {
    insights: (data.insights_json as KognitosInsights) ?? null,
    p2p: (data.p2p_summary as P2PInsights) ?? null,
  };
}

export interface KognitosRunRow {
  id: string;
  name: string;
  run: KognitosRun;
}

/** All synced runs for dashboard tables (newest first). */
export async function listKognitosRunRowsFromDb(): Promise<KognitosRunRow[]> {
  const { data, error } = await sb()
    .from("kognitos_runs")
    .select("id, name, payload")
    .order("create_time", { ascending: false });
  if (error) throw error;
  const out: KognitosRunRow[] = [];
  for (const row of data ?? []) {
    const run = parseKognitosRunPayload(row.payload);
    if (run) {
      out.push({
        id: String(row.id),
        name: String(row.name),
        run,
      });
    }
  }
  return out;
}
