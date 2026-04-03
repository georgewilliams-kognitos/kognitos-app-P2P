"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Building2,
  Zap,
  Check,
  X,
  FileCheck,
  ThumbsUp,
  ThumbsDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DOMAIN } from "@/lib/domain.config";
import { useAuth } from "@/lib/auth-context";
import {
  getKognitosInsightsCacheFromDb,
  listKognitosRunRowsFromDb,
  findVendorByDisplayName,
  findVendorForMaterialName,
  listVendors,
  resolveVendorByDisplayName,
  type KognitosRunRow,
} from "@/lib/api";
import type { Vendor } from "@/lib/types";
import {
  buildP2pTriageAlerts,
  TRIAGE_CHECK_ORDER,
  type TriageAlert,
} from "@/lib/p2p-triage";
import {
  getReadOverrides,
  setReadOverride,
} from "@/lib/notification-state";
import type { KognitosInsights } from "@/lib/types";
import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
} from "@/lib/p2p-insights";
import {
  averageRunDurationMs,
  formatDurationMs,
  topMaterialFromRuns,
  topVendorStatsFromRuns,
} from "@/lib/kognitos/dashboard-metrics";
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

/** Bar chart fills using the approved yellow/olive palette (no gradients). */
const CHART_BAR = {
  // 1) rgb(207,219,76)  2) rgb(195,208,65)  3) rgb(183,196,53)
  // 4) rgb(124,137,1)   5) rgb(99,109,2)
  track:
    "rounded-full border border-border/70 bg-muted/45 dark:bg-muted/50",
  // 1st shade
  pass: "bg-[#cfdb4c]",
  // 3rd shade
  fail: "bg-[#b7c435]",
  // 2nd shade
  passRow: "bg-[#c3d041]",
  // 5th shade (reserved)
  failRow: "bg-[#636d02]",
} as const;

const RUN_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type TimePeriod = "last_90_days" | "year_to_date" | "last_year" | "all_time";
/** Completed checks table: payment recommendation from run summary (same as vendor Invoices Processed/Pending). */
type CompletedPaymentFilter = "pending" | "processed";

function getPeriodStart(period: TimePeriod, now = new Date()): Date | null {
  const d = new Date(now);
  if (period === "all_time") return null;
  if (period === "last_90_days") {
    d.setDate(d.getDate() - 90);
    return d;
  }
  if (period === "year_to_date") {
    return new Date(d.getFullYear(), 0, 1);
  }
  return new Date(d.getFullYear() - 1, 0, 1);
}

function inSelectedPeriod(iso: string | undefined, period: TimePeriod): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const now = new Date();
  const start = getPeriodStart(period, now);
  if (start == null) return true;
  if (period === "last_year") {
    const end = new Date(now.getFullYear(), 0, 1);
    return t >= start.getTime() && t < end.getTime();
  }
  return t >= start.getTime() && t <= now.getTime();
}

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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

/** KPI row above “Completed checks” — same layout as Vercel-Test home dashboard. */
function FourWayMatchKpiCard({
  label,
  value,
  description,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  description?: string;
  icon: React.ElementType;
  href?: string;
}) {
  const content = (
    <CardContent className="flex items-start justify-between px-5">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-md bg-primary/10 p-2.5">
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </CardContent>
  );
  if (!href) return <Card className="gap-4 rounded-xl py-5">{content}</Card>;
  return (
    <Card className="gap-4 rounded-xl py-5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/30 hover:shadow-md">
      <Link
        href={href}
        className="block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {content}
      </Link>
    </Card>
  );
}

// ── Dashboard Page ──────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<KognitosInsights | null>(null);
  const [runRows, setRunRows] = useState<KognitosRunRow[]>([]);
  const [completedPage, setCompletedPage] = useState(0);
  const [incompletePage, setIncompletePage] = useState(0);
  const [completedRowsPerPage, setCompletedRowsPerPage] = useState(10);
  const [incompleteRowsPerPage, setIncompleteRowsPerPage] = useState(10);
  const [completedPaymentFilter, setCompletedPaymentFilter] =
    useState<CompletedPaymentFilter>("pending");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all_time");
  const [triageAlerts, setTriageAlerts] = useState<
    Array<TriageAlert & { vendorHref: string; is_read: boolean }>
  >([]);

  function loadDashboardData() {
    Promise.all([
      getKognitosInsightsCacheFromDb(),
      listKognitosRunRowsFromDb().catch((err) => {
        console.error("listKognitosRunRowsFromDb:", err);
        return [] as KognitosRunRow[];
      }),
    ]).then(([cache, rows]) => {
      setInsights(cache.insights);
      setRunRows(rows);
    });
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const handler = () => loadDashboardData();
    window.addEventListener("chat-data-changed", handler);
    return () => window.removeEventListener("chat-data-changed", handler);
  }, []);

  const filteredRunRows = useMemo(
    () =>
      runRows.filter((row) => inSelectedPeriod(row.run.createTime, timePeriod)),
    [runRows, timePeriod],
  );

  const p2pForWidgets = useMemo(() => {
    const parsed = filteredRunRows
      .map((row) => extractFourWayMatchFromRun(row.run))
      .filter((x): x is NonNullable<typeof x> => x != null);
    const summaries = filteredRunRows.map((row) => buildRunSummaryFromRun(row.run));
    return aggregateResults(parsed, summaries);
  }, [filteredRunRows]);

  /** Only runs with a completed 4-way check (extractable match); processed % is payment-approved within this set. */
  const completedChecksInvoiceStats = useMemo(() => {
    let withCompletedChecks = 0;
    let processedCount = 0;
    for (const row of filteredRunRows) {
      if (extractFourWayMatchFromRun(row.run) == null) continue;
      withCompletedChecks += 1;
      if (buildRunSummaryFromRun(row.run).paymentApproved === true) {
        processedCount += 1;
      }
    }
    const pendingCount = withCompletedChecks - processedCount;
    return {
      total: withCompletedChecks,
      processedCount,
      pendingCount,
      processedPct:
        withCompletedChecks > 0
          ? Math.round((100 * processedCount) / withCompletedChecks)
          : 0,
    };
  }, [filteredRunRows]);

  const { completedRunRows, incompleteRunRows } = useMemo(() => {
    const completed = filteredRunRows.filter((row) =>
      isCompletedRun(row.run, p2pForWidgets),
    );
    const incomplete = filteredRunRows.filter((row) =>
      !isCompletedRun(row.run, p2pForWidgets),
    );
    return { completedRunRows: completed, incompleteRunRows: incomplete };
  }, [filteredRunRows, p2pForWidgets]);

  const totalRunsDisplay = useMemo(
    () => filteredRunRows.length,
    [filteredRunRows.length],
  );

  const stpDisplay = useMemo(() => {
    if (filteredRunRows.length === 0) return 0;
    return Math.round((completedRunRows.length / filteredRunRows.length) * 100);
  }, [filteredRunRows.length, completedRunRows.length]);

  const awaitingGuidanceDisplay = useMemo(() => {
    return filteredRunRows.filter(
      (r) => getRunStateLabel(r.run.state) === "awaitingGuidance",
    ).length;
  }, [filteredRunRows]);

  const avgRunDurationMs = useMemo(
    () => averageRunDurationMs(completedRunRows.map((r) => r.run)),
    [completedRunRows],
  );

  const topVendor = useMemo(
    () => topVendorStatsFromRuns(filteredRunRows.map((r) => r.run)),
    [filteredRunRows],
  );

  const topMaterial = useMemo(
    () => topMaterialFromRuns(filteredRunRows.map((r) => r.run)),
    [filteredRunRows],
  );
  const [topVendorHref, setTopVendorHref] = useState<string | undefined>(
    undefined,
  );
  const [topVendorDisplayName, setTopVendorDisplayName] = useState<
    string | undefined
  >(undefined);
  const [topMaterialHref, setTopMaterialHref] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    const resolveTopVendorHref = async () => {
      if (!topVendor?.vendor) {
        if (!cancelled) {
          setTopVendorHref(undefined);
          setTopVendorDisplayName(undefined);
        }
        return;
      }
      try {
        const hit = await findVendorByDisplayName(topVendor.vendor);
        if (!cancelled) {
          setTopVendorHref(hit ? `/vendors/${hit.vendor_id}` : "/vendors");
          setTopVendorDisplayName(hit?.company_name ?? topVendor.vendor);
        }
      } catch {
        if (!cancelled) {
          setTopVendorHref("/vendors");
          setTopVendorDisplayName(topVendor.vendor);
        }
      }
    };
    resolveTopVendorHref();
    return () => {
      cancelled = true;
    };
  }, [topVendor?.vendor]);

  useEffect(() => {
    let cancelled = false;
    const resolveTopMaterialHref = async () => {
      if (!topMaterial?.material) {
        if (!cancelled) setTopMaterialHref(undefined);
        return;
      }
      try {
        const hit = await findVendorForMaterialName(topMaterial.material);
        if (!cancelled) {
          if (!hit) {
            setTopMaterialHref("/vendors");
            return;
          }
          const queryMaterial = encodeURIComponent(topMaterial.material);
          setTopMaterialHref(`/vendors/${hit.vendor.vendor_id}?material=${queryMaterial}`);
        }
      } catch {
        if (!cancelled) setTopMaterialHref("/vendors");
      }
    };
    resolveTopMaterialHref();
    return () => {
      cancelled = true;
    };
  }, [topMaterial?.material]);

  const validationHealth = useMemo(() => {
    const checks = [
      { key: "documentMatch" as const, label: "1 - Document Match", order: 1 },
      {
        key: "quantityAndUnitMatch" as const,
        label: "2 - Quantity and Unit Match",
        order: 2,
      },
      { key: "valueMatch" as const, label: "3 - Value Match", order: 3 },
      { key: "coaValidation" as const, label: "4 - COA Validation", order: 4 },
    ];

    const byCheck = checks.map(({ key, label, order }) => {
      let pass = 0;
      let fail = 0;
      for (const run of p2pForWidgets.runs) {
        const status = run[key];
        if (status === "PASS") pass += 1;
        else if (status === "FAIL") fail += 1;
      }
      const total = pass + fail;
      return {
        key,
        order,
        label,
        pass,
        fail,
        total,
        passRate: total > 0 ? Math.round((100 * pass) / total) : 0,
      };
    });

    const totalFailedChecks = byCheck.reduce((sum, c) => sum + c.fail, 0);
    const overallTotal = p2pForWidgets.validationPass + p2pForWidgets.validationFail;
    const overallPassRate =
      overallTotal > 0
        ? Math.round((100 * p2pForWidgets.validationPass) / overallTotal)
        : 0;

    return {
      overallPassRate,
      overallPass: p2pForWidgets.validationPass,
      overallFail: p2pForWidgets.validationFail,
      totalFailedChecks,
      byCheck: byCheck.sort((a, b) => a.order - b.order),
    };
  }, [p2pForWidgets]);

  const unreadTriageByVendor = useMemo(() => {
    const groups = new Map<
      string,
      {
        vendorName: string;
        vendorHref: string;
        alerts: Array<TriageAlert & { vendorHref: string; is_read: boolean }>;
      }
    >();
    for (const alert of triageAlerts) {
      if (alert.is_read) continue;
      const key = `${alert.vendorName}::${alert.vendorHref}`;
      const group = groups.get(key);
      if (group) {
        group.alerts.push(alert);
      } else {
        groups.set(key, {
          vendorName: alert.vendorName,
          vendorHref: alert.vendorHref,
          alerts: [alert],
        });
      }
    }
    return [...groups.values()];
  }, [triageAlerts]);

  useEffect(() => {
    let cancelled = false;
    const loadTriage = async () => {
      if (!user) return;
      const alerts = buildP2pTriageAlerts(filteredRunRows);
      const overrides = getReadOverrides();
      let vendors: Vendor[] = [];
      try {
        vendors = await listVendors();
      } catch {
        /* banner still works with fallback links */
      }
      const withLinks = alerts.map((a) => {
        const hit = resolveVendorByDisplayName(vendors, a.vendorName);
        return {
          ...a,
          vendorName: hit?.company_name ?? a.vendorName,
          vendorHref: hit ? `/vendors/${hit.vendor_id}` : "/vendors",
          is_read: overrides[a.id] ?? false,
        };
      });
      if (!cancelled) setTriageAlerts(withLinks);
    };
    loadTriage();
    return () => {
      cancelled = true;
    };
  }, [filteredRunRows, user]);

  const completedRunRowsPaymentFiltered = useMemo(() => {
    return completedRunRows.filter((row) => {
      const runId = runIdFromName(row.run.name);
      const enriched = p2pForWidgets.runs?.find((r) => r.runId === runId);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {DOMAIN.entity.plural} performance overview
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <Select
            value={timePeriod}
            onValueChange={(v) => setTimePeriod(v as TimePeriod)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_90_days">Last 90 days</SelectItem>
              <SelectItem value="year_to_date">Year To Date</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          {unreadTriageByVendor.length > 0 && (
            <Card className="border-l-4 border-l-red-500 bg-red-100/70 dark:bg-red-950/30">
              <CardHeader className="space-y-0 pb-0 pt-0">
                <CardTitle className="text-base leading-none">Action Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {unreadTriageByVendor.map((vendorGroup) => {
                  const byFailureType = TRIAGE_CHECK_ORDER.map((key) => ({
                    key,
                    alerts: vendorGroup.alerts.filter((a) => a.checkKey === key),
                  })).filter((g) => g.alerts.length > 0);

                  return (
                    <div
                      key={`${vendorGroup.vendorName}-${vendorGroup.vendorHref}`}
                      className="rounded-lg border border-border/70 bg-card px-3 py-2"
                    >
                      <p className="mb-2 text-sm font-semibold">
                        {vendorGroup.vendorName}
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
                        {byFailureType.map((ft) => {
                          const n = ft.alerts.length;
                          const label = ft.alerts[0].checkLabel;
                          const rec = ft.alerts[0].recommendation;
                          return (
                            <li key={ft.key}>
                              {label} Failed - {n}{" "}
                              {n === 1 ? "Invoice" : "Invoices"} - {rec}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                        <Button
                          asChild
                          size="sm"
                          className="bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-100 hover:text-black focus-visible:ring-emerald-500/90 dark:bg-emerald-600 dark:hover:bg-emerald-200 dark:hover:text-black"
                        >
                          <Link
                            href={vendorGroup.vendorHref}
                            className="inline-flex items-center gap-1.5"
                          >
                            See Vendor
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const ids = new Set(
                              vendorGroup.alerts.map((a) => a.id),
                            );
                            vendorGroup.alerts.forEach((a) =>
                              setReadOverride(a.id, true),
                            );
                            setTriageAlerts((prev) =>
                              prev.map((row) =>
                                ids.has(row.id) ? { ...row, is_read: true } : row,
                              ),
                            );
                          }}
                        >
                          Mark as Read
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FourWayMatchKpiCard
              label="Top Vendor"
              value={topVendorDisplayName ?? topVendor?.vendor ?? "—"}
              icon={Building2}
              href={topVendorHref}
              description={
                topVendor
                  ? `${topVendor.count} invoice${topVendor.count === 1 ? "" : "s"} • ${currencyFmt.format(topVendor.approvedPaymentsTotal)} total`
                  : undefined
              }
            />
            <FourWayMatchKpiCard
              label="Top Material"
              value={topMaterial?.material ?? "—"}
              icon={FileCheck}
              href={topMaterialHref}
              description={
                topMaterial
                  ? `${topMaterial.totalCount} purchased`
                  : undefined
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FourWayMatchKpiCard
              label="Total Approved Payments"
              value={currencyFmt.format(p2pForWidgets.totalApprovedValue)}
              description={`${p2pForWidgets.paymentApproveCount} recommended for payment`}
              icon={ThumbsUp}
            />
            <FourWayMatchKpiCard
              label="Total Rejected Payments"
              value={currencyFmt.format(p2pForWidgets.totalRejectedValue)}
              description={`${p2pForWidgets.paymentRejectCount} reject or hold`}
              icon={ThumbsDown}
            />
          </div>

          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle>Validation Health</CardTitle>
              <CardDescription>
                Payment processing vs pending for completed checks; per-check
                pass rates below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                <div className={`flex h-7 w-full overflow-hidden p-0.5 ${CHART_BAR.track}`}>
                  <div
                    className={`grid min-w-0 place-items-center text-[11px] font-semibold text-[#374200] transition-[width] duration-300 ease-out ${CHART_BAR.pass} ${
                      completedChecksInvoiceStats.processedCount <= 0
                        ? "hidden"
                        : completedChecksInvoiceStats.pendingCount <= 0
                          ? "rounded-full"
                          : "rounded-l-full"
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, completedChecksInvoiceStats.processedPct))}%`,
                    }}
                  >
                    {completedChecksInvoiceStats.processedCount > 0
                      ? `${completedChecksInvoiceStats.processedCount} processed`
                      : ""}
                  </div>
                  <div
                    className={`grid min-w-0 place-items-center text-[11px] font-semibold text-[#3f4600] transition-[width] duration-300 ease-out ${CHART_BAR.fail} ${
                      completedChecksInvoiceStats.pendingCount <= 0
                        ? "hidden"
                        : completedChecksInvoiceStats.processedCount <= 0
                          ? "rounded-full"
                          : "rounded-r-full"
                    }`}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          100 - completedChecksInvoiceStats.processedPct,
                        ),
                      )}%`,
                    }}
                  >
                    {completedChecksInvoiceStats.pendingCount > 0
                      ? `${completedChecksInvoiceStats.pendingCount} pending`
                      : ""}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {completedChecksInvoiceStats.total}{" "}
                  {completedChecksInvoiceStats.total === 1
                    ? "Invoice"
                    : "Invoices"}{" "}
                  • {completedChecksInvoiceStats.processedPct}% processed
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {validationHealth.byCheck.map((check) => {
                  const failImpact =
                    validationHealth.totalFailedChecks > 0
                      ? Math.round(
                          (100 * check.fail) / validationHealth.totalFailedChecks,
                        )
                      : 0;
                  return (
                    <div
                      key={check.key}
                      className="rounded-lg border border-border/70 bg-card px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{check.label}</p>
                        <Badge
                          variant="secondary"
                          className="bg-[#c3d041]/35 text-foreground"
                        >
                          {check.passRate}% pass
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {check.fail} failure{check.fail === 1 ? "" : "s"} ({failImpact}%
                          impact)
                        </span>
                        <span>
                          {check.pass}/{check.total} passed
                        </span>
                      </div>
                      <div className={`mt-2 h-2 overflow-hidden p-px ${CHART_BAR.track}`}>
                        <div
                          className={`h-full rounded-full ${CHART_BAR.fail}`}
                          style={{ width: `${failImpact}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Completed checks</CardTitle>
            <CardDescription>
              Runs that finished with a completed state (4-way match and related
              outputs when available)
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
                    setCompletedPaymentFilter(v as CompletedPaymentFilter);
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
                        <TableHead>Invoice Number</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Goods Receipt</TableHead>
                        <TableHead
                          className="w-10 text-center"
                          title="Document Match"
                        >
                          1
                        </TableHead>
                        <TableHead
                          className="w-10 text-center"
                          title="Quantity and Unit Match"
                        >
                          2
                        </TableHead>
                        <TableHead
                          className="w-10 text-center"
                          title="Value Match"
                        >
                          3
                        </TableHead>
                        <TableHead
                          className="w-10 text-center"
                          title="COA Validation"
                        >
                          4
                        </TableHead>
                        <TableHead
                          className="w-10 text-center"
                          title="Payment approval"
                        >
                          P
                        </TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedPagedRows.map(({ run }) => {
                      const runId = runIdFromName(run.name);
                      const enriched = p2pForWidgets.runs?.find((r) => r.runId === runId);
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
                          <TableCell>{enriched?.invoiceNumber ?? "—"}</TableCell>
                          <TableCell>{enriched?.poNumber ?? "—"}</TableCell>
                          <TableCell>
                            {enriched?.goodsReceiptNumber ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <CheckOrCross
                              pass={enriched?.documentMatch === "PASS"}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <CheckOrCross
                              pass={enriched?.quantityAndUnitMatch === "PASS"}
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
                            <CheckOrCross pass={enriched?.paymentApproved} />
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
                      <span className="text-sm text-muted-foreground">Rows</span>
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
            <CardTitle>Incomplete checks</CardTitle>
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
                        <TableHead className="text-right">
                          More details
                        </TableHead>
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
                                variant={
                                  stateBadgeVariant[state] ?? "secondary"
                                }
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
      </div>

      {/* Kognitos Automation Insights (moved to bottom) */}
      {(insights != null || filteredRunRows.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Kognitos Automation Insights
            </CardTitle>
            {filteredRunRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Values in this card reflect the selected time window.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Runs
                </p>
                <p className="text-lg font-bold">{totalRunsDisplay}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Completion rate
                </p>
                <p className="text-lg font-bold">{stpDisplay}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Average Run Time
                </p>
                <p className="text-lg font-bold">
                  {formatDurationMs(avgRunDurationMs)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Awaiting Guidance
                </p>
                <p className="text-lg font-bold">{awaitingGuidanceDisplay}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
