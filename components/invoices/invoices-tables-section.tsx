"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  ExternalLink,
  Lock,
  Mail,
  Play,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { getTriageAlertsForRun } from "@/lib/p2p-triage";
import { buildVendorInvoiceRowDraftEmail } from "@/lib/vendor-triage-email";

const RUN_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

/** Shared outline + emerald hover for action icon buttons (`group/btn` avoids clashing with `group/row` on the table row). */
const INVOICES_ACTIONS_ICON_BUTTON_CLASS =
  "group/btn text-muted-foreground shadow-xs not-disabled:hover:!border-emerald-600 not-disabled:hover:!bg-emerald-600 not-disabled:hover:!text-white not-disabled:hover:shadow-sm focus-visible:ring-emerald-500/90 dark:not-disabled:hover:!bg-emerald-600";

/** Emerald primary actions (matches vendor Action Items “Draft Email” style). */
const INVOICES_EMERALD_ACTION_BUTTON_CLASS =
  "gap-1.5 bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-100 hover:text-black focus-visible:ring-emerald-500/90 dark:bg-emerald-600 dark:hover:bg-emerald-200 dark:hover:text-black";

type ReanalyzeDialogPayload = {
  vendorLabel: string;
  invoiceNumber: string;
  valueText: string;
  documentMatch?: string;
  quantityAndUnitMatch?: string;
  valueMatch?: string;
  coaValidation?: string;
  paymentApproved?: boolean;
  runId: string;
};

function fourWayCellLabel(v: string | undefined): string {
  if (v === "PASS") return "Pass";
  if (v === "FAIL") return "Fail";
  return "—";
}

function paymentCellLabel(approved: boolean | undefined): string {
  if (approved === true) return "Pass";
  if (approved === false) return "Fail";
  return "—";
}

type CompletedPaymentFilter = "pending" | "processed" | "all";

function vendorFilterKeyForRun(
  run: KognitosRunRow["run"],
  vendorsList: Vendor[],
): string {
  const extracted = extractVendorFromRun(run);
  const resolved = resolveVendorByDisplayName(vendorsList, extracted ?? "");
  if (resolved) return `id:${resolved.vendor_id}`;
  const t = extracted?.trim();
  if (t) return `name:${t.toLowerCase()}`;
  return "__none__";
}

function rowMatchesLockedVendor(
  row: KognitosRunRow,
  vendorsList: Vendor[],
  lockedVendorId: string,
): boolean {
  const resolved = resolveVendorByDisplayName(
    vendorsList,
    extractVendorFromRun(row.run) ?? "",
  );
  return resolved?.vendor_id === lockedVendorId;
}

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
  if (p === "processed" || p === "pending" || p === "all") return p;
  return "pending";
}

export function InvoicesTablesSection({
  showInvoicesOnHold = true,
  lockedVendorId,
}: {
  /** When false, only the “Invoices Analyzed” card is shown (e.g. Dashboard). */
  showInvoicesOnHold?: boolean;
  /** When set, rows are limited to this vendor and the vendor picker is hidden (e.g. vendor detail page). */
  lockedVendorId?: string;
} = {}) {
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
  const [emailDraftDialog, setEmailDraftDialog] = useState<{
    vendor: Vendor;
    subject: string;
    body: string;
  } | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [reanalyzeDialog, setReanalyzeDialog] =
    useState<ReanalyzeDialogPayload | null>(null);
  /** Empty = all vendors (no filter). */
  const [selectedVendorKeys, setSelectedVendorKeys] = useState<string[]>([]);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollEl, setTableScrollEl] = useState<HTMLDivElement | null>(
    null,
  );
  const [actionsColumnStacked, setActionsColumnStacked] = useState(false);

  const setTableScrollContainer = useCallback(
    (node: HTMLDivElement | null) => {
      tableScrollRef.current = node;
      setTableScrollEl(node);
    },
    [],
  );

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

  const analyzedVendorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of completedRunRows) {
      const key = vendorFilterKeyForRun(row.run, vendors);
      if (map.has(key)) continue;
      const extracted = extractVendorFromRun(row.run);
      const resolved = resolveVendorByDisplayName(vendors, extracted ?? "");
      const label =
        resolved?.company_name ??
        (extracted?.trim() ? extracted.trim() : "Unknown / no vendor");
      map.set(key, label);
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [completedRunRows, vendors]);

  useEffect(() => {
    if (lockedVendorId) return;
    const valid = new Set(analyzedVendorOptions.map((o) => o.key));
    setSelectedVendorKeys((prev) => {
      const next = prev.filter((k) => valid.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [analyzedVendorOptions, lockedVendorId]);

  const completedRunRowsByPayment = useMemo(() => {
    return completedRunRows.filter((row) => {
      const rid = runIdFromName(row.run.name);
      const enriched = p2pForWidgets.runs?.find((r) => r.runId === rid);
      const processedForPayment = enriched?.paymentApproved === true;
      if (completedPaymentFilter === "all") return true;
      if (completedPaymentFilter === "processed") return processedForPayment;
      return !processedForPayment;
    });
  }, [completedRunRows, p2pForWidgets, completedPaymentFilter]);

  const completedRunRowsFiltered = useMemo(() => {
    let base = completedRunRowsByPayment;
    if (lockedVendorId) {
      base = base.filter((row) =>
        rowMatchesLockedVendor(row, vendors, lockedVendorId),
      );
    } else if (selectedVendorKeys.length > 0) {
      const sel = new Set(selectedVendorKeys);
      base = base.filter((row) =>
        sel.has(vendorFilterKeyForRun(row.run, vendors)),
      );
    }
    return base;
  }, [
    completedRunRowsByPayment,
    selectedVendorKeys,
    vendors,
    lockedVendorId,
  ]);

  useLayoutEffect(() => {
    const el = tableScrollEl;
    if (!el) return;
    const sync = () => {
      setActionsColumnStacked(el.scrollLeft > 0);
    };
    sync();
    const raf = requestAnimationFrame(sync);
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [
    tableScrollEl,
    completedRunRowsFiltered.length,
    completedPage,
    completedRowsPerPage,
  ]);

  const incompleteRunRowsForView = useMemo(() => {
    if (!lockedVendorId) return incompleteRunRows;
    return incompleteRunRows.filter((row) =>
      rowMatchesLockedVendor(row, vendors, lockedVendorId),
    );
  }, [incompleteRunRows, lockedVendorId, vendors]);

  const completedLastPage = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(
          completedRunRowsFiltered.length / completedRowsPerPage,
        ) - 1,
      ),
    [completedRunRowsFiltered.length, completedRowsPerPage],
  );

  const completedPagedRows = useMemo(() => {
    const start = completedPage * completedRowsPerPage;
    return completedRunRowsFiltered.slice(
      start,
      start + completedRowsPerPage,
    );
  }, [
    completedRunRowsFiltered,
    completedPage,
    completedRowsPerPage,
  ]);

  const incompleteLastPage = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(incompleteRunRowsForView.length / incompleteRowsPerPage) - 1,
      ),
    [incompleteRunRowsForView.length, incompleteRowsPerPage],
  );

  const incompletePagedRows = useMemo(() => {
    const start = incompletePage * incompleteRowsPerPage;
    return incompleteRunRowsForView.slice(
      start,
      start + incompleteRowsPerPage,
    );
  }, [incompleteRunRowsForView, incompletePage, incompleteRowsPerPage]);

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(
        completedRunRowsFiltered.length / completedRowsPerPage,
      ) - 1,
    );
    if (completedPage > maxPage) setCompletedPage(maxPage);
  }, [
    completedRunRowsFiltered.length,
    completedPage,
    completedRowsPerPage,
  ]);

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(incompleteRunRowsForView.length / incompleteRowsPerPage) - 1,
    );
    if (incompletePage > maxPage) setIncompletePage(maxPage);
  }, [
    incompleteRunRowsForView.length,
    incompletePage,
    incompleteRowsPerPage,
  ]);

  useEffect(() => {
    setCompletedPage(0);
  }, [completedRowsPerPage]);

  useEffect(() => {
    setCompletedPage(0);
  }, [completedPaymentFilter, selectedVendorKeys.join("|"), lockedVendorId]);

  useEffect(() => {
    setIncompletePage(0);
  }, [incompleteRowsPerPage]);

  /** Inset line + border; `border-separate` keeps the sticky column’s left edge visible. Width 1pt to match design. */
  const actionsStickyEdge = actionsColumnStacked
    ? "border-l-[1pt] border-border pl-3 shadow-[inset_1pt_0_0_0_hsl(var(--border)),inset_1px_0_0_0_rgba(0,0,0,0.06),-10px_0_20px_-6px_rgba(0,0,0,0.1),-4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[inset_1pt_0_0_0_hsl(var(--border)),inset_1px_0_0_0_rgba(255,255,255,0.06),-12px_0_24px_-6px_rgba(0,0,0,0.55),-4px_0_10px_-2px_rgba(0,0,0,0.35)]"
    : "border-l-[1pt] border-border pl-3 shadow-[inset_1pt_0_0_0_hsl(var(--border))]";

  const actionsHeadSticky = `sticky right-0 z-20 min-w-[6.75rem] bg-background text-right ${actionsStickyEdge}`;
  /** Opaque hover fill so stacked sticky Actions cells don’t show scrolled content behind (muted/50 is translucent). */
  const actionsCellSticky = `sticky right-0 z-10 min-w-[6.75rem] bg-background text-right group-hover/row:bg-muted ${actionsStickyEdge}`;

  return (
    <TooltipProvider delayDuration={0}>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <Tabs
                  value={completedPaymentFilter}
                  onValueChange={(v) => {
                    setCompletedPaymentFilter(v as CompletedPaymentFilter);
                    setCompletedPage(0);
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="processed">Processed</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                {lockedVendorId ? (
                  <div
                    className="flex max-w-full min-w-0 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm"
                    title="Vendor filter is fixed on this page"
                  >
                    <Lock
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {vendors.find((v) => v.vendor_id === lockedVendorId)
                        ?.company_name ?? lockedVendorId}
                    </span>
                  </div>
                ) : (
                  analyzedVendorOptions.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-[10rem] justify-between gap-2 font-normal"
                      >
                        <span className="truncate">
                          {selectedVendorKeys.length === 0
                            ? "All vendors"
                            : selectedVendorKeys.length === 1
                              ? (analyzedVendorOptions.find(
                                  (o) => o.key === selectedVendorKeys[0],
                                )?.label ?? "Vendors")
                              : `${selectedVendorKeys.length} vendors`}
                        </span>
                        <ChevronDown className="size-4 shrink-0 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                      <div className="border-b px-3 py-2">
                        <p className="text-sm font-medium">Vendor</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-2">
                        <div className="space-y-1">
                          {analyzedVendorOptions.map((opt) => (
                            <label
                              key={opt.key}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={selectedVendorKeys.includes(opt.key)}
                                onCheckedChange={(checked) => {
                                  setSelectedVendorKeys((prev) => {
                                    if (checked === true) {
                                      return prev.includes(opt.key)
                                        ? prev
                                        : [...prev, opt.key];
                                    }
                                    return prev.filter((k) => k !== opt.key);
                                  });
                                  setCompletedPage(0);
                                }}
                              />
                              <span className="leading-snug">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {selectedVendorKeys.length > 0 && (
                        <div className="border-t px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSelectedVendorKeys([]);
                              setCompletedPage(0);
                            }}
                          >
                            Clear selection
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  )
                )}
              </div>
              {completedRunRowsFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed checks in this view.
                </p>
              ) : (
                <>
                  <div className="max-w-full">
                    <Table
                      ref={setTableScrollContainer}
                      className="border-separate border-spacing-0 [&_thead_tr_th]:border-b [&_thead_tr_th]:border-border [&_tbody_tr_td]:border-b [&_tbody_tr_td]:border-border [&_tbody_tr:last-child_td]:border-b-0"
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Value</TableHead>
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
                          <TableHead>Completed</TableHead>
                          <TableHead className={actionsHeadSticky}>
                            Actions
                          </TableHead>
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
                                  { omitSeconds: true },
                                )
                              : "—";
                          const href = kognitosRunOpenHref(run.name);
                          const rowTriageAlerts = getTriageAlertsForRun(
                            row,
                            runRows,
                          );
                          const canDraftEmail =
                            Boolean(vendorResolved) &&
                            rowTriageAlerts.length > 0;
                          return (
                            <TableRow key={run.name} className="group/row">
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
                              <TableCell>
                                {enriched?.poTotalValue != null
                                  ? new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2,
                                    }).format(enriched.poTotalValue)
                                  : "—"}
                              </TableCell>
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
                              <TableCell>{completedTimeStr}</TableCell>
                              <TableCell className={actionsCellSticky}>
                                <div className="inline-flex items-center justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        asChild
                                        variant="outline"
                                        size="icon-xs"
                                        className={`${INVOICES_ACTIONS_ICON_BUTTON_CLASS} [&_svg]:size-4`}
                                      >
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          aria-label="Review in Kognitos"
                                        >
                                          <Eye
                                            className="size-4 text-muted-foreground transition-colors group-hover/btn:text-white"
                                            aria-hidden
                                          />
                                        </a>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      Review in Kognitos
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-xs"
                                        className={`${INVOICES_ACTIONS_ICON_BUTTON_CLASS} [&_svg]:size-4`}
                                        disabled={!canDraftEmail}
                                        aria-label="Draft email to vendor"
                                        onClick={() => {
                                          if (!vendorResolved || !canDraftEmail)
                                            return;
                                          const { subject, body } =
                                            buildVendorInvoiceRowDraftEmail(
                                              rowTriageAlerts,
                                              vendorResolved,
                                            );
                                          setEmailDraftDialog({
                                            vendor: vendorResolved,
                                            subject,
                                            body,
                                          });
                                          setEmailCopied(false);
                                        }}
                                      >
                                        <Mail
                                          className="size-4 text-muted-foreground transition-colors group-hover/btn:text-white"
                                          aria-hidden
                                        />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      {!vendorResolved
                                        ? "Vendor must be linked to a master record"
                                        : rowTriageAlerts.length === 0
                                          ? "No payment issues to follow up for this invoice"
                                          : "Draft email to vendor"}
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-xs"
                                        className={`${INVOICES_ACTIONS_ICON_BUTTON_CLASS} [&_svg]:size-4`}
                                        aria-label="Re-analyze in Kognitos"
                                        onClick={() => {
                                          setReanalyzeDialog({
                                            vendorLabel,
                                            invoiceNumber: invoiceLabel,
                                            valueText:
                                              enriched?.poTotalValue != null
                                                ? new Intl.NumberFormat(
                                                    "en-US",
                                                    {
                                                      style: "currency",
                                                      currency: "USD",
                                                      minimumFractionDigits: 0,
                                                      maximumFractionDigits: 2,
                                                    },
                                                  ).format(enriched.poTotalValue)
                                                : "—",
                                            documentMatch: enriched?.documentMatch,
                                            quantityAndUnitMatch:
                                              enriched?.quantityAndUnitMatch,
                                            valueMatch: enriched?.valueMatch,
                                            coaValidation:
                                              enriched?.coaValidation,
                                            paymentApproved:
                                              enriched?.paymentApproved,
                                            runId,
                                          });
                                        }}
                                      >
                                        <Play
                                          className="size-4 text-muted-foreground transition-colors group-hover/btn:text-white"
                                          aria-hidden
                                        />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      Re-analyze in Kognitos
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
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
                      {completedRunRowsFiltered.length === 0
                        ? 0
                        : completedPage * completedRowsPerPage + 1}
                      –
                      {Math.min(
                        (completedPage + 1) * completedRowsPerPage,
                        completedRunRowsFiltered.length,
                      )}{" "}
                      of {completedRunRowsFiltered.length}
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

      {showInvoicesOnHold && (
        <Card>
          <CardHeader>
            <CardTitle>Invoices on hold</CardTitle>
            <CardDescription>
              Runs pending, in progress, failed, stopped, or awaiting guidance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incompleteRunRowsForView.length === 0 ? (
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
                    {incompleteRunRowsForView.length === 0
                      ? 0
                      : incompletePage * incompleteRowsPerPage + 1}
                    –
                    {Math.min(
                      (incompletePage + 1) * incompleteRowsPerPage,
                      incompleteRunRowsForView.length,
                    )}{" "}
                    of {incompleteRunRowsForView.length}
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
      )}

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

      <Dialog
        open={emailDraftDialog !== null}
        onOpenChange={(open) => {
          if (!open) setEmailDraftDialog(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg md:max-w-3xl"
          showCloseButton
        >
          {emailDraftDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>Draft email</DialogTitle>
                <DialogDescription>
                  Review and send to{" "}
                  {emailDraftDialog.vendor.primary_contact_email?.trim() ??
                    "your vendor contact"}
                  .
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Subject
                </p>
                <p className="rounded-md border bg-muted/30 px-3 py-2 font-sans text-sm">
                  {emailDraftDialog.subject}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  Message
                </p>
                <Textarea
                  readOnly
                  value={emailDraftDialog.body}
                  className="min-h-[280px] resize-y font-sans text-sm leading-relaxed"
                />
              </div>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `Subject: ${emailDraftDialog.subject}\n\n${emailDraftDialog.body}`,
                      );
                      setEmailCopied(true);
                      setTimeout(() => setEmailCopied(false), 2000);
                    } catch {
                      setEmailCopied(false);
                    }
                  }}
                >
                  {emailCopied ? "Copied" : "Copy email"}
                </Button>
                {emailDraftDialog.vendor.primary_contact_email?.trim() &&
                emailDraftDialog.subject ? (
                  <Button type="button" asChild>
                    <a
                      href={`mailto:${encodeURIComponent(
                        emailDraftDialog.vendor.primary_contact_email.trim(),
                      )}?subject=${encodeURIComponent(
                        emailDraftDialog.subject,
                      )}&body=${encodeURIComponent(emailDraftDialog.body)}`}
                    >
                      Open in email app
                    </a>
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" disabled>
                    Add contact email to vendor record
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={reanalyzeDialog !== null}
        onOpenChange={(open) => {
          if (!open) setReanalyzeDialog(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
          showCloseButton
        >
          {reanalyzeDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>Re-analyze in Kognitos</DialogTitle>
                <DialogDescription>
                  Analysis summary for Invoice {reanalyzeDialog.invoiceNumber}{" "}
                  from {reanalyzeDialog.vendorLabel}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-border/70 bg-card px-4 py-3 shadow-sm">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-0.5">
                      <dt className="text-xs text-muted-foreground">Vendor</dt>
                      <dd className="font-medium text-foreground">
                        {reanalyzeDialog.vendorLabel}
                      </dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs text-muted-foreground">Invoice</dt>
                      <dd className="font-medium text-foreground">
                        {reanalyzeDialog.invoiceNumber}
                      </dd>
                    </div>
                    <div className="space-y-0.5 sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Value</dt>
                      <dd className="font-medium text-foreground">
                        {reanalyzeDialog.valueText}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-lg border border-border/70 bg-card px-4 py-3 shadow-sm">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    4-way match
                  </p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-1.5">
                      <dt className="text-muted-foreground">DOC</dt>
                      <dd className="font-medium tabular-nums">
                        {fourWayCellLabel(reanalyzeDialog.documentMatch)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-1.5">
                      <dt className="text-muted-foreground">QTY</dt>
                      <dd className="font-medium tabular-nums">
                        {fourWayCellLabel(
                          reanalyzeDialog.quantityAndUnitMatch,
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-1.5">
                      <dt className="text-muted-foreground">VAL</dt>
                      <dd className="font-medium tabular-nums">
                        {fourWayCellLabel(reanalyzeDialog.valueMatch)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-1.5">
                      <dt className="text-muted-foreground">COA</dt>
                      <dd className="font-medium tabular-nums">
                        {fourWayCellLabel(reanalyzeDialog.coaValidation)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-md bg-muted/30 px-2 py-1.5 sm:col-span-2">
                      <dt className="text-muted-foreground">PAY</dt>
                      <dd className="font-medium tabular-nums">
                        {paymentCellLabel(reanalyzeDialog.paymentApproved)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  className={INVOICES_EMERALD_ACTION_BUTTON_CLASS}
                >
                  <Play
                    className="size-4 shrink-0 fill-none stroke-[2.5] stroke-current"
                    aria-hidden
                  />
                  Analyze with same invoice
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={INVOICES_EMERALD_ACTION_BUTTON_CLASS}
                >
                  <Play
                    className="size-4 shrink-0 fill-white stroke-none"
                    aria-hidden
                  />
                  Analyze with new invoice
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      </>
    </TooltipProvider>
  );
}
