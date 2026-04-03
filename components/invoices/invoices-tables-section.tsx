"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listKognitosRunRowsFromDb,
  listVendors,
  resolveVendorByDisplayName,
  type KognitosRunRow,
} from "@/lib/api";
import type { Vendor } from "@/lib/types";
import { inSelectedPeriod } from "@/lib/dashboard-time-period";
import { useSharedTimePeriod } from "@/contexts/time-period-context";
import {
  dashboardInvoiceFileHref,
  type DashboardInvoicePreview,
} from "@/lib/dashboard-invoice-file";
import {
  formatRunTime,
  getCompletedTimeFromRun,
  getRunStateDisplayLabel,
  getRunStateLabel,
  getStateReason,
  isCompletedRun,
  kognitosRunOpenHref,
  runIdFromName,
  type RunStateLabel,
} from "@/lib/kognitos/run-dashboard";
import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
  extractVendorFromRun,
} from "@/lib/p2p-insights";

const RUN_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

type CompletedPaymentFilter = "pending" | "processed";

const stateBadgeVariant: Record<
  RunStateLabel,
  "success" | "destructive" | "warning" | "secondary" | "default"
> = {
  completed: "success",
  failed: "destructive",
  executing: "warning",
  pending: "secondary",
  stopped: "warning",
  stopping: "warning",
  paused: "warning",
  awaitingGuidance: "default",
  unknown: "secondary",
};

function CheckOrCross({ pass }: { pass: boolean | undefined }) {
  if (pass === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return pass ? (
    <Check className="inline-block h-4 w-4 text-success" />
  ) : (
    <X className="inline-block h-4 w-4 text-destructive" />
  );
}

function paymentFilterFromSearchParams(
  params: URLSearchParams | null,
): CompletedPaymentFilter {
  const p = params?.get("payment");
  if (p === "processed" || p === "pending") return p;
  return "pending";
}

export function InvoicesTablesSection() {
  const searchParams = useSearchParams();
  const { timePeriod } = useSharedTimePeriod();
  const [runRows, setRunRows] = useState<KognitosRunRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [completedPage, setCompletedPage] = useState(0);
  const [incompletePage, setIncompletePage] = useState(0);
  const [completedRowsPerPage, setCompletedRowsPerPage] = useState(10);
  const [incompleteRowsPerPage, setIncompleteRowsPerPage] = useState(10);
  const [completedPaymentFilter, setCompletedPaymentFilter] =
    useState<CompletedPaymentFilter>(() =>
      paymentFilterFromSearchParams(searchParams),
    );

  useEffect(() => {
    const next = paymentFilterFromSearchParams(searchParams);
    setCompletedPaymentFilter((prev) => {
      if (prev === next) return prev;
      setCompletedPage(0);
      return next;
    });
  }, [searchParams]);
  const [invoicePreview, setInvoicePreview] =
    useState<DashboardInvoicePreview | null>(null);

  const loadRuns = useCallback(() => {
    listKognitosRunRowsFromDb()
      .catch((err) => {
        console.error("listKognitosRunRowsFromDb:", err);
        return [] as KognitosRunRow[];
      })
      .then(setRunRows);
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const handler = () => loadRuns();
    window.addEventListener("chat-data-changed", handler);
    return () => window.removeEventListener("chat-data-changed", handler);
  }, [loadRuns]);

  useEffect(() => {
    listVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
  }, []);

  const filteredRunRows = useMemo(
    () =>
      runRows.filter((row) =>
        inSelectedPeriod(row.run.createTime, timePeriod),
      ),
    [runRows, timePeriod],
  );

  const p2pForWidgets = useMemo(() => {
    const parsed = filteredRunRows
      .map((row) => extractFourWayMatchFromRun(row.run))
      .filter((x): x is NonNullable<typeof x> => x != null);
    const summaries = filteredRunRows.map((row) =>
      buildRunSummaryFromRun(row.run),
    );
    return aggregateResults(parsed, summaries);
  }, [filteredRunRows]);

  const { completedRunRows, incompleteRunRows } = useMemo(() => {
    const completed = filteredRunRows.filter((row) =>
      isCompletedRun(row.run, p2pForWidgets),
    );
    const incomplete = filteredRunRows.filter(
      (row) => !isCompletedRun(row.run, p2pForWidgets),
    );
    return { completedRunRows: completed, incompleteRunRows: incomplete };
  }, [filteredRunRows, p2pForWidgets]);

  const completedRunRowsPaymentFiltered = useMemo(() => {
    return completedRunRows.filter((row) => {
      const rid = runIdFromName(row.run.name);
      const enriched = p2pForWidgets.runs?.find((r) => r.runId === rid);
      const processedForPayment = enriched?.paymentApproved === true;
      if (completedPaymentFilter === "processed") return processedForPayment;
      return !processedForPayment;
    });
  }, [completedRunRows, p2pForWidgets, completedPaymentFilter]);

  const completedLastPage = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(
          completedRunRowsPaymentFiltered.length / completedRowsPerPage,
        ) - 1,
      ),
    [completedRunRowsPaymentFiltered.length, completedRowsPerPage],
  );

  const completedPagedRows = useMemo(() => {
    const start = completedPage * completedRowsPerPage;
    return completedRunRowsPaymentFiltered.slice(
      start,
      start + completedRowsPerPage,
    );
  }, [
    completedRunRowsPaymentFiltered,
    completedPage,
    completedRowsPerPage,
  ]);

  const incompleteLastPage = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(incompleteRunRows.length / incompleteRowsPerPage) - 1,
      ),
    [incompleteRunRows.length, incompleteRowsPerPage],
  );

  const incompletePagedRows = useMemo(() => {
    const start = incompletePage * incompleteRowsPerPage;
    return incompleteRunRows.slice(start, start + incompleteRowsPerPage);
  }, [incompleteRunRows, incompletePage, incompleteRowsPerPage]);

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(
        completedRunRowsPaymentFiltered.length / completedRowsPerPage,
      ) - 1,
    );
    if (completedPage > maxPage) setCompletedPage(maxPage);
  }, [
    completedRunRowsPaymentFiltered.length,
    completedPage,
    completedRowsPerPage,
  ]);

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(incompleteRunRows.length / incompleteRowsPerPage) - 1,
    );
    if (incompletePage > maxPage) setIncompletePage(maxPage);
  }, [incompleteRunRows.length, incompletePage, incompleteRowsPerPage]);

  useEffect(() => {
    setCompletedPage(0);
  }, [completedRowsPerPage]);

  useEffect(() => {
    setIncompletePage(0);
  }, [incompleteRowsPerPage]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Invoices Analyzed</CardTitle>
          <CardDescription>
            Invoices validated against Goods Receipt, Purchase Orders and Quality
            Results (4-way matching)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedRunRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No completed runs in the database yet.
            </p>
          ) : (
            <div className="space-y-4">
              <Tabs
                value={completedPaymentFilter}
                onValueChange={(v) => {
                  setCompletedPaymentFilter(v as "pending" | "processed");
                  setCompletedPage(0);
                }}
              >
                <TabsList>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="processed">Processed</TabsTrigger>
                </TabsList>
              </Tabs>
              {completedRunRowsPaymentFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed checks in this view.
                </p>
              ) : (
                <>
                  <div className="max-w-full overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor Name</TableHead>
                          <TableHead>Invoice Number</TableHead>
                          <TableHead>PO Number</TableHead>
                          <TableHead
                            className="w-11 min-w-[2.75rem] text-center text-xs font-medium uppercase"
                            title="Document Match"
                          >
                            DOC
                          </TableHead>
                          <TableHead
                            className="w-11 min-w-[2.75rem] text-center text-xs font-medium uppercase"
                            title="Quantity and Unit Match"
                          >
                            QTY
                          </TableHead>
                          <TableHead
                            className="w-11 min-w-[2.75rem] text-center text-xs font-medium uppercase"
                            title="Value Match"
                          >
                            VAL
                          </TableHead>
                          <TableHead
                            className="w-11 min-w-[2.75rem] text-center text-xs font-medium uppercase"
                            title="COA Validation"
                          >
                            COA
                          </TableHead>
                          <TableHead
                            className="w-11 min-w-[2.75rem] text-center text-xs font-medium uppercase"
                            title="Payment approval"
                          >
                            PAY
                          </TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead className="text-right">Completed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completedPagedRows.map((row) => {
                          const { run, id: kognitosRunTableId, payloadRaw } =
                            row;
                          const runId = runIdFromName(run.name);
                          const enriched = p2pForWidgets.runs?.find(
                            (r) => r.runId === runId,
                          );
                          const extractedVendor = extractVendorFromRun(run);
                          const vendorResolved = resolveVendorByDisplayName(
                            vendors,
                            extractedVendor ?? "",
                          );
                          const vendorLabel =
                            vendorResolved?.company_name ??
                            (extractedVendor?.trim() ? extractedVendor : "—");
                          const vendorPageHref = vendorResolved
                            ? `/vendors/${vendorResolved.vendor_id}`
                            : null;
                          const invoiceLabel = enriched?.invoiceNumber ?? "—";
                          const invoicePdfHref =
                            vendorResolved && kognitosRunTableId
                              ? dashboardInvoiceFileHref(
                                  vendorResolved.vendor_id,
                                  kognitosRunTableId,
                                  payloadRaw,
                                )
                              : null;
                          const state = getRunStateLabel(run.state);
                          const completedTimeStr =
                            state === "completed"
                              ? formatRunTime(
                                  enriched?.completedTime ??
                                    getCompletedTimeFromRun(run),
                                )
                              : "—";
                          const href = kognitosRunOpenHref(run.name);
                          return (
                            <TableRow key={run.name}>
                              <TableCell>
                                {vendorPageHref ? (
                                  <Link
                                    href={vendorPageHref}
                                    className="text-foreground hover:underline"
                                  >
                                    {vendorLabel}
                                  </Link>
                                ) : (
                                  vendorLabel
                                )}
                              </TableCell>
                              <TableCell>
                                {invoicePdfHref ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!vendorResolved || !kognitosRunTableId)
                                        return;
                                      setInvoicePreview({
                                        vendorId: vendorResolved.vendor_id,
                                        runId: kognitosRunTableId,
                                        payloadRaw,
                                        invoiceNumber: invoiceLabel,
                                      });
                                    }}
                                    className="m-0 cursor-pointer border-0 bg-transparent p-0 text-left text-foreground hover:underline"
                                  >
                                    {invoiceLabel}
                                  </button>
                                ) : (
                                  invoiceLabel
                                )}
                              </TableCell>
                              <TableCell>{enriched?.poNumber ?? "—"}</TableCell>
                              <TableCell className="text-center">
                                <CheckOrCross
                                  pass={enriched?.documentMatch === "PASS"}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <CheckOrCross
                                  pass={
                                    enriched?.quantityAndUnitMatch === "PASS"
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <CheckOrCross
                                  pass={enriched?.valueMatch === "PASS"}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <CheckOrCross
                                  pass={enriched?.coaValidation === "PASS"}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <CheckOrCross
                                  pass={enriched?.paymentApproved}
                                />
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {enriched?.poTotalValue != null
                                  ? new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2,
                                    }).format(enriched.poTotalValue)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {state === "completed" ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:underline"
                                  >
                                    {completedTimeStr}
                                  </a>
                                ) : (
                                  completedTimeStr
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing{" "}
                      {completedRunRowsPaymentFiltered.length === 0
                        ? 0
                        : completedPage * completedRowsPerPage + 1}
                      –
                      {Math.min(
                        (completedPage + 1) * completedRowsPerPage,
                        completedRunRowsPaymentFiltered.length,
                      )}{" "}
                      of {completedRunRowsPaymentFiltered.length}
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Rows
                        </span>
                        <Select
                          value={String(completedRowsPerPage)}
                          onValueChange={(v) =>
                            setCompletedRowsPerPage(Number(v))
                          }
                        >
                          <SelectTrigger size="sm" className="w-[70px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RUN_TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="First page"
                          disabled={completedPage <= 0}
                          onClick={() => setCompletedPage(0)}
                        >
                          <ChevronFirst className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Previous page"
                          disabled={completedPage <= 0}
                          onClick={() =>
                            setCompletedPage((p) => Math.max(0, p - 1))
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
                          disabled={completedPage >= completedLastPage}
                          onClick={() =>
                            setCompletedPage((p) =>
                              Math.min(completedLastPage, p + 1),
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
                          disabled={completedPage >= completedLastPage}
                          onClick={() => setCompletedPage(completedLastPage)}
                        >
                          <ChevronLast className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices on hold</CardTitle>
          <CardDescription>
            Runs pending, in progress, failed, stopped, or awaiting guidance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incompleteRunRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No incomplete runs.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Started At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">More details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incompletePagedRows.map(({ run }) => {
                      const state = getRunStateLabel(run.state);
                      const href = kognitosRunOpenHref(run.name);
                      return (
                        <TableRow key={run.name}>
                          <TableCell className="max-w-[120px] truncate font-mono text-xs">
                            {runIdFromName(run.name)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatRunTime(run.createTime)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={stateBadgeVariant[state] ?? "secondary"}
                              className={
                                state === "stopped"
                                  ? "border-transparent bg-warning/20 text-foreground"
                                  : state === "pending"
                                    ? "border-transparent bg-muted text-foreground"
                                    : undefined
                              }
                            >
                              {getRunStateDisplayLabel(state)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {getStateReason(run.state)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:underline"
                            >
                              See Run
                            </a>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  {incompleteRunRows.length === 0
                    ? 0
                    : incompletePage * incompleteRowsPerPage + 1}
                  –
                  {Math.min(
                    (incompletePage + 1) * incompleteRowsPerPage,
                    incompleteRunRows.length,
                  )}{" "}
                  of {incompleteRunRows.length}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows</span>
                    <Select
                      value={String(incompleteRowsPerPage)}
                      onValueChange={(v) =>
                        setIncompleteRowsPerPage(Number(v))
                      }
                    >
                      <SelectTrigger size="sm" className="w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RUN_TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      aria-label="First page"
                      disabled={incompletePage <= 0}
                      onClick={() => setIncompletePage(0)}
                    >
                      <ChevronFirst className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      aria-label="Previous page"
                      disabled={incompletePage <= 0}
                      onClick={() =>
                        setIncompletePage((p) => Math.max(0, p - 1))
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
                      disabled={incompletePage >= incompleteLastPage}
                      onClick={() =>
                        setIncompletePage((p) =>
                          Math.min(incompleteLastPage, p + 1),
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
                      disabled={incompletePage >= incompleteLastPage}
                      onClick={() => setIncompletePage(incompleteLastPage)}
                    >
                      <ChevronLast className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
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
          {invoicePreview ? (
            <>
              <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 pr-14 text-left">
                <DialogTitle>
                  {invoicePreview.invoiceNumber &&
                  invoicePreview.invoiceNumber !== "—"
                    ? `Invoice ${invoicePreview.invoiceNumber}`
                    : "Document preview"}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  Run {invoicePreview.runId}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 px-6 pb-2">
                <iframe
                  key={`${invoicePreview.vendorId}-${invoicePreview.runId}`}
                  title="Invoice document preview"
                  src={dashboardInvoiceFileHref(
                    invoicePreview.vendorId,
                    invoicePreview.runId,
                    invoicePreview.payloadRaw,
                  )}
                  className="h-[min(72vh,820px)] w-full rounded-md border bg-muted"
                />
              </div>
              <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-between">
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a
                    href={dashboardInvoiceFileHref(
                      invoicePreview.vendorId,
                      invoicePreview.runId,
                      invoicePreview.payloadRaw,
                    )}
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
                      href={dashboardInvoiceFileHref(
                        invoicePreview.vendorId,
                        invoicePreview.runId,
                        invoicePreview.payloadRaw,
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
    </>
  );
}
