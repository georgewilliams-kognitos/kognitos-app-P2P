"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  PackageCheck,
  Truck,
} from "lucide-react";
import {
  getVendorById,
  getProductsForVendor,
  listKognitosRunRowsFromDb,
  listVendorInvoicesForVendor,
  type KognitosRunRow,
} from "@/lib/api";
import type { Vendor, VendorInvoice, VendorProduct } from "@/lib/types";
import {
  buildLatestPaymentApprovedByInvoiceForVendor,
  buildP2pTriageAlertsForVendor,
  normalizeInvoiceKey,
  type TriageAlert,
} from "@/lib/p2p-triage";
import { VendorActionItemsBanner } from "@/components/vendors/vendor-action-items-banner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

function invoiceFileHref(
  vendorId: string,
  inv: VendorInvoice,
  disposition?: "attachment",
) {
  const q = new URLSearchParams({
    vendorId,
    runId: inv.kognitos_run_id,
    inputKey: inv.input_key,
  });
  if (disposition) q.set("disposition", disposition);
  return `/api/kognitos/invoice-file?${q.toString()}`;
}

const INVOICE_TABLE_PAGE_SIZE = 20;

type InvoiceFilterTab = "all" | "processed" | "pending";

function vendorInvoiceMatchesFilter(
  inv: VendorInvoice,
  filter: InvoiceFilterTab,
  byInvoice: Map<string, boolean | undefined>,
): boolean {
  if (filter === "all") return true;
  const key = inv.invoice_number
    ? normalizeInvoiceKey(inv.invoice_number)
    : null;
  if (!key || !byInvoice.has(key)) return false;
  const approved = byInvoice.get(key);
  if (filter === "processed") return approved === true;
  return approved !== true;
}

export default function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const searchParams = useSearchParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [runRows, setRunRows] = useState<KognitosRunRow[]>([]);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilterTab>("all");
  const [invoicePage, setInvoicePage] = useState(0);
  const [invoicePreview, setInvoicePreview] = useState<VendorInvoice | null>(null);

  useEffect(() => {
    getVendorById(id).then((data) => {
      if (!data) {
        setNotFound(true);
        return;
      }
      setVendor(data);
    });
    getProductsForVendor(id).then(setProducts).catch(console.error);
  }, [id]);

  useEffect(() => {
    listKognitosRunRowsFromDb()
      .then(setRunRows)
      .catch(console.error);
  }, []);

  useEffect(() => {
    listVendorInvoicesForVendor(id)
      .then(setInvoices)
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    setInvoicePreview(null);
  }, [id]);

  const vendorTriageAlerts = useMemo((): TriageAlert[] => {
    if (!vendor) return [];
    return buildP2pTriageAlertsForVendor(runRows, vendor);
  }, [runRows, vendor]);

  const paymentByInvoice = useMemo(
    () =>
      vendor
        ? buildLatestPaymentApprovedByInvoiceForVendor(runRows, vendor)
        : new Map<string, boolean | undefined>(),
    [runRows, vendor],
  );

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((inv) =>
        vendorInvoiceMatchesFilter(inv, invoiceFilter, paymentByInvoice),
      ),
    [invoices, invoiceFilter, paymentByInvoice],
  );

  const invoiceLastPage = Math.max(
    0,
    Math.ceil(filteredInvoices.length / INVOICE_TABLE_PAGE_SIZE) - 1,
  );

  useEffect(() => {
    setInvoicePage((p) => Math.min(p, invoiceLastPage));
  }, [invoiceLastPage]);

  const paginatedInvoices = useMemo(() => {
    const start = invoicePage * INVOICE_TABLE_PAGE_SIZE;
    return filteredInvoices.slice(start, start + INVOICE_TABLE_PAGE_SIZE);
  }, [filteredInvoices, invoicePage]);

  const topProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => (b.price_per_unit_usd ?? 0) - (a.price_per_unit_usd ?? 0))
        .slice(0, 10),
    [products],
  );
  const defaultMaterialTab = useMemo(() => {
    const material = searchParams.get("material");
    if (!material || topProducts.length === 0) {
      return topProducts[0]?.product_id;
    }
    const norm = material.toLowerCase().trim();
    const hit = topProducts.find((p) => {
      const byName = p.product_name.toLowerCase().includes(norm);
      const byCatalog = (p.catalog_number ?? "").toLowerCase().includes(norm);
      const exactName = p.product_name.toLowerCase() === norm;
      const exactCatalog = (p.catalog_number ?? "").toLowerCase() === norm;
      return exactName || exactCatalog || byName || byCatalog;
    });
    return hit?.product_id ?? topProducts[0]?.product_id;
  }, [searchParams, topProducts]);

  if (notFound) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-2xl font-semibold">Vendor not found</h2>
        <p className="text-muted-foreground">
          No vendor exists with ID &ldquo;{id}&rdquo;.
        </p>
        <Button asChild variant="outline">
          <Link href="/vendors">
            <ArrowLeft className="size-4" />
            Back to Vendors
          </Link>
        </Button>
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/vendors">
          <ArrowLeft className="size-4" />
          All Vendors
        </Link>
      </Button>

      <VendorActionItemsBanner vendor={vendor} alerts={vendorTriageAlerts} />

      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl">{vendor.company_name}</CardTitle>
              <p className="font-mono text-sm text-muted-foreground">
                {vendor.vendor_id}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{vendor.qualification_status ?? "—"}</Badge>
              <Badge variant="outline" className="capitalize">
                Risk: {vendor.vendor_risk_rating ?? "—"}
              </Badge>
              {vendor.preferred_vendor && <Badge variant="default">Preferred</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Primary Contact
              </p>
              <p className="text-sm font-medium">{vendor.primary_contact_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {vendor.primary_contact_email ?? "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Country / Region
              </p>
              <p className="text-sm font-medium">
                {[vendor.country, vendor.region].filter(Boolean).join(" • ") || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Payment Terms
              </p>
              <p className="text-sm font-medium">
                {vendor.payment_terms_days != null
                  ? `Net ${vendor.payment_terms_days} (${vendor.currency ?? "USD"})`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Incoterms: {vendor.incoterms ?? "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Annual Spend / Contract
              </p>
              <p className="text-sm font-medium">
                {vendor.annual_spend_usd != null
                  ? formatCurrency(vendor.annual_spend_usd)
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Contract end: {formatDate(vendor.contract_end_date)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No catalog materials found for this vendor.
            </p>
          ) : (
            <Tabs defaultValue={defaultMaterialTab}>
              <TabsList
                variant="line"
                className="w-full justify-start overflow-x-auto whitespace-nowrap"
              >
                {topProducts.map((material) => (
                  <TabsTrigger key={material.product_id} value={material.product_id}>
                    {material.product_name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {topProducts.map((material) => (
                <TabsContent
                  key={material.product_id}
                  value={material.product_id}
                  className="mt-4"
                >
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card>
                        <CardHeader className="pb-0">
                          <CardTitle className="text-sm">Product</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                          <p className="font-medium">{material.product_name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {material.product_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Cat #: {material.catalog_number ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            CAS: {material.cas_number ?? "—"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-0">
                          <CardTitle className="text-sm">Pricing</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                          <p className="font-medium">
                            {material.price_per_unit_usd != null
                              ? `${formatCurrency(material.price_per_unit_usd)} / ${material.unit_of_measure ?? "unit"}`
                              : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            MOQ: {material.minimum_order_quantity ?? "—"}{" "}
                            {material.unit_of_measure ?? ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last buy:{" "}
                            {material.last_purchased_price != null
                              ? formatCurrency(material.last_purchased_price)
                              : "—"}{" "}
                            ({formatDate(material.last_purchased_date)})
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-0">
                          <CardTitle className="text-sm">Logistics</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                          <p className="font-medium">
                            <Truck className="mr-1 inline size-4" />
                            {material.availability_status ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Lead time: {material.lead_time_days ?? "—"} days
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Ship from: {material.ships_from_country ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Temp: {material.temperature_requirement ?? "—"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-0">
                          <CardTitle className="text-sm">Compliance</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                          <p className="font-medium">
                            <PackageCheck className="mr-1 inline size-4" />
                            GMP: {material.gmp_manufactured ? "Yes" : "No"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            CoA: {material.coa_available ? "Available" : "Missing"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            MSDS: {material.msds_available ? "Available" : "Missing"}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-0">
                        <CardTitle className="text-base">
                          Material Ops Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-muted-foreground" />
                          DMF: {material.dmf_number ?? "—"} • CEP:{" "}
                          {material.cep_number ?? "—"}
                        </div>
                        <p>Shipping class: {material.shipping_class ?? "—"}</p>
                        <p>Packaging: {material.packaging_options ?? "—"}</p>
                        <p>Last updated: {formatDate(material.updated_at)}</p>
                        <p>
                          {material.notes ??
                            "No additional vendor-side notes provided for this material."}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No validation runs matched this vendor yet. After syncing Kognitos runs, run{" "}
              <code className="text-xs">npm run reindex:vendor-invoices</code> so supplier IDs from
              the report are linked to <code className="text-xs">vendor_id</code>.
            </p>
          ) : (
            <Tabs
              value={invoiceFilter}
              onValueChange={(v) => {
                setInvoiceFilter(v as InvoiceFilterTab);
                setInvoicePage(0);
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="processed">Processed</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
              <TabsContent value={invoiceFilter} className="space-y-2 pt-4">
                {filteredInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No invoices in this view.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="max-w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Run</TableHead>
                            <TableHead className="text-right">PDF</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedInvoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-medium">
                                {inv.invoice_number ?? "—"}
                              </TableCell>
                              <TableCell>{inv.invoice_date_text ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {inv.kognitos_run_id}
                              </TableCell>
                              <TableCell className="text-right">
                                {inv.kognitos_file_id ? (
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setInvoicePreview(inv)}
                                    >
                                      <Eye className="mr-1 size-3.5" />
                                      View
                                    </Button>
                                    <Button variant="outline" size="sm" asChild>
                                      <a
                                        href={invoiceFileHref(
                                          vendor.vendor_id,
                                          inv,
                                          "attachment",
                                        )}
                                        download
                                      >
                                        <Download className="mr-1 size-3.5" />
                                        Download
                                      </a>
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Report only
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing{" "}
                        {filteredInvoices.length === 0
                          ? 0
                          : invoicePage * INVOICE_TABLE_PAGE_SIZE + 1}
                        –
                        {Math.min(
                          (invoicePage + 1) * INVOICE_TABLE_PAGE_SIZE,
                          filteredInvoices.length,
                        )}{" "}
                        of {filteredInvoices.length}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="First page"
                          disabled={invoicePage <= 0}
                          onClick={() => setInvoicePage(0)}
                        >
                          <ChevronFirst className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Previous page"
                          disabled={invoicePage <= 0}
                          onClick={() =>
                            setInvoicePage((p) => Math.max(0, p - 1))
                          }
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Next page"
                          disabled={invoicePage >= invoiceLastPage}
                          onClick={() =>
                            setInvoicePage((p) =>
                              Math.min(invoiceLastPage, p + 1),
                            )
                          }
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Last page"
                          disabled={invoicePage >= invoiceLastPage}
                          onClick={() => setInvoicePage(invoiceLastPage)}
                        >
                          <ChevronLast className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={invoicePreview !== null}
        onOpenChange={(open) => {
          if (!open) setInvoicePreview(null);
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[92vh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          {vendor && invoicePreview ? (
            <>
              <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 pr-14 text-left">
                <DialogTitle>
                  {invoicePreview.invoice_number
                    ? `Invoice ${invoicePreview.invoice_number}`
                    : invoicePreview.file_name?.trim()
                      ? invoicePreview.file_name
                      : "Document preview"}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  Run {invoicePreview.kognitos_run_id}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 px-6 pb-2">
                <iframe
                  key={invoicePreview.id}
                  title="Invoice document preview"
                  src={invoiceFileHref(vendor.vendor_id, invoicePreview)}
                  className="h-[min(72vh,820px)] w-full rounded-md border bg-muted"
                />
              </div>
              <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-between">
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a
                    href={invoiceFileHref(vendor.vendor_id, invoicePreview)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    Open in new tab
                  </a>
                </Button>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a
                      href={invoiceFileHref(
                        vendor.vendor_id,
                        invoicePreview,
                        "attachment",
                      )}
                      download
                    >
                      <Download className="mr-1.5 size-3.5" />
                      Download
                    </a>
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
