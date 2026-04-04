"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Clock,
  Building2,
  FileCheck,
  ThumbsUp,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvoicesTablesSection } from "@/components/invoices/invoices-tables-section";
import { TimePeriodSelect } from "@/components/dashboard/time-period-select";
import { useSharedTimePeriod } from "@/contexts/time-period-context";

import { useAuth } from "@/lib/auth-context";
import {
  findVendorByDisplayName,
  findVendorForMaterialName,
  getKognitosInsightsCacheFromDb,
  listKognitosRunRowsFromDb,
  listVendors,
  resolveVendorByDisplayName,
  type KognitosRunRow,
} from "@/lib/api";
import type { Vendor } from "@/lib/types";
import {
  buildP2pTriageAlerts,
  TRIAGE_CHECK_ORDER,
  type TriageAlert,
  type TriageCheckKey,
} from "@/lib/p2p-triage";
import {
  getReadOverrides,
  setReadOverride,
} from "@/lib/notification-state";
import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
} from "@/lib/p2p-insights";
import type { KognitosInsights } from "@/lib/types";
import {
  averageRunDurationMs,
  formatDurationMs,
  topMaterialFromRuns,
  topVendorStatsFromRuns,
} from "@/lib/kognitos/dashboard-metrics";
import { isCompletedRun } from "@/lib/kognitos/run-dashboard";
import { inSelectedPeriod, type TimePeriod } from "@/lib/dashboard-time-period";

/** Bar chart fills using the approved yellow/olive palette (no gradients). */
const CHART_BAR = {
  // 1) rgb(207,219,76)  2) rgb(195,208,65)  3) rgb(183,196,53)
  // 4) rgb(124,137,1)   5) rgb(99,109,2)
  track:
    "rounded-xl border border-border/70 bg-muted/45 dark:bg-muted/50",
  // 1st shade
  pass: "bg-[#cfdb4c]",
  // 2nd shade
  passRow: "bg-[#c3d041]",
  // 5th shade (reserved)
  failRow: "bg-[#636d02]",
} as const;

/** Pending slice: stacked failure types (lighter → darker left to right, DOC → COA). */
const PENDING_FAIL_SEGMENTS = [
  {
    key: "documentMatch" as const,
    abbr: "DOC",
    legend: "DOC - Pending due to Document Mismatch",
  },
  {
    key: "quantityAndUnitMatch" as const,
    abbr: "QTY",
    legend: "QTY - Pending due to Quantity and Unit Mismatch",
  },
  {
    key: "valueMatch" as const,
    abbr: "VAL",
    legend: "VAL - Pending due to Value Mismatch",
  },
  {
    key: "coaValidation" as const,
    abbr: "COA",
    legend: "COA - Pending due to COA Validation",
  },
] as const;

/** Wider threshold at 13px label size so “proc.” only when truly squeezed. */
const PROCESSED_LABEL_NARROW_PX = 94;

/**
 * Shifted-from-generic ramp (DOC→QTY→VAL→COA). COA uses a darker olive than VAL so the
 * last two bands don’t read as the same hue (#7f8a2e vs #6c7828).
 */
const PENDING_FAIL_COLORS = [
  "bg-[#b7c435]",
  "bg-[#8a942f]",
  "bg-[#7f8a2e]",
  "bg-[#6c7828]",
] as const;

/** Label colors for contrast (VAL/COA mid–dark olives — light text). */
const PENDING_FAIL_LABEL_TEXT = [
  "text-[#3f4600]",
  "text-[#1f2908]",
  "text-[#f6faef]",
  "text-[#f6faef]",
] as const;

function triageMismatchHeading(key: TriageCheckKey): string {
  switch (key) {
    case "documentMatch":
      return "Document Mismatch";
    case "quantityAndUnitMatch":
      return "Quantity and Unit Mismatch";
    case "valueMatch":
      return "Value Mismatch";
    case "coaValidation":
      return "Quality Check Failed";
    default:
      return "Mismatch";
  }
}

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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

function ValidationProcessedSegment({
  processedCount,
  pendingCount,
  roundedClass,
}: {
  processedCount: number;
  pendingCount: number;
  roundedClass: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setNarrow(el.getBoundingClientRect().width < PROCESSED_LABEL_NARROW_PX);
  }, [processedCount, pendingCount]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setNarrow(el.getBoundingClientRect().width < PROCESSED_LABEL_NARROW_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [processedCount, pendingCount]);

  return (
    <div
      ref={ref}
      className={`flex min-w-0 flex-col justify-center px-1 text-center text-[13px] font-semibold leading-tight text-[#374200] transition-[flex] duration-300 ease-out ${CHART_BAR.pass} ${roundedClass}`}
      style={{
        flexGrow: processedCount,
        flexBasis: 0,
      }}
      title={`Processed payment: ${processedCount}`}
    >
      <span className="min-w-0 truncate">
        {processedCount} {narrow ? "proc." : "processed"}
      </span>
    </div>
  );
}

// ── Dashboard Page ──────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { timePeriod } = useSharedTimePeriod();
  const [runRows, setRunRows] = useState<KognitosRunRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [triageAlerts, setTriageAlerts] = useState<
    Array<TriageAlert & { vendorHref: string; is_read: boolean }>
  >([]);

  function loadDashboardData() {
    listKognitosRunRowsFromDb()
      .catch((err) => {
        console.error("listKognitosRunRowsFromDb:", err);
        return [] as KognitosRunRow[];
      })
      .then(setRunRows);
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const handler = () => loadDashboardData();
    window.addEventListener("chat-data-changed", handler);
    return () => window.removeEventListener("chat-data-changed", handler);
  }, []);

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

  const { completedRunRows } = useMemo(() => {
    const completed = filteredRunRows.filter((row) =>
      isCompletedRun(row.run, p2pForWidgets),
    );
    return { completedRunRows: completed };
  }, [filteredRunRows, p2pForWidgets]);

  /** Only runs with a completed 4-way check (extractable match); processed % is payment-approved within this set. */
  const completedChecksInvoiceStats = useMemo(() => {
    let withCompletedChecks = 0;
    let processedCount = 0;
    let pendingPaymentsTotalUsd = 0;
    for (const row of filteredRunRows) {
      if (extractFourWayMatchFromRun(row.run) == null) continue;
      withCompletedChecks += 1;
      const summary = buildRunSummaryFromRun(row.run);
      if (summary.paymentApproved === true) {
        processedCount += 1;
      } else {
        const v = summary.poTotalValue;
        if (v != null && Number.isFinite(v)) pendingPaymentsTotalUsd += v;
      }
    }
    const pendingCount = withCompletedChecks - processedCount;
    return {
      total: withCompletedChecks,
      processedCount,
      pendingCount,
      pendingPaymentsTotalUsd,
      processedPct:
        withCompletedChecks > 0
          ? Math.round((100 * processedCount) / withCompletedChecks)
          : 0,
    };
  }, [filteredRunRows]);

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

  /** FAIL counts per check among invoices with completed validation and payment still pending. */
  const pendingPaymentFailureBreakdown = useMemo(() => {
    const fails: Record<
      (typeof PENDING_FAIL_SEGMENTS)[number]["key"],
      number
    > = {
      documentMatch: 0,
      quantityAndUnitMatch: 0,
      valueMatch: 0,
      coaValidation: 0,
    };
    for (const row of filteredRunRows) {
      if (extractFourWayMatchFromRun(row.run) == null) continue;
      const s = buildRunSummaryFromRun(row.run);
      if (s.paymentApproved === true) continue;
      for (const def of PENDING_FAIL_SEGMENTS) {
        if (s[def.key] === "FAIL") fails[def.key] += 1;
      }
    }
    const items = PENDING_FAIL_SEGMENTS.map((def, i) => ({
      ...def,
      count: fails[def.key],
      colorClass: PENDING_FAIL_COLORS[i],
      textClass: PENDING_FAIL_LABEL_TEXT[i],
    }));
    const totalFailMarks = items.reduce((sum, x) => sum + x.count, 0);
    return { items, totalFailMarks };
  }, [filteredRunRows]);

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
  }, [filteredRunRows, user, vendors]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Validation health, payments, and triage for the selected period
          </p>
        </div>
        <TimePeriodSelect />
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
                          const rec = ft.alerts[0].recommendation;
                          return (
                            <li key={ft.key}>
                              {n} Pending{" "}
                              {n === 1 ? "Invoice" : "Invoices"} -{" "}
                              {triageMismatchHeading(ft.key)} - {rec}
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
              label="Total Pending Payments"
              value={currencyFmt.format(
                completedChecksInvoiceStats.pendingPaymentsTotalUsd,
              )}
              description={`${completedChecksInvoiceStats.pendingCount} pending invoices`}
              icon={Clock}
              href="/invoices?payment=pending"
            />
            <FourWayMatchKpiCard
              label="Total Approved Payments"
              value={currencyFmt.format(p2pForWidgets.totalApprovedValue)}
              description={`${p2pForWidgets.paymentApproveCount} processed invoices`}
              icon={ThumbsUp}
              href="/invoices?payment=processed"
            />
          </div>
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

          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle>Validation Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {completedChecksInvoiceStats.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invoices with completed validation in this period.
                </p>
              ) : (
                <>
                  <div
                    className={`flex h-12 w-full min-w-0 overflow-hidden p-0.5 shadow-sm ${CHART_BAR.track}`}
                    role="img"
                    aria-label={`Validation health: ${completedChecksInvoiceStats.processedCount} processed, ${completedChecksInvoiceStats.pendingCount} pending of ${completedChecksInvoiceStats.total} invoices`}
                  >
                    {completedChecksInvoiceStats.processedCount > 0 && (
                      <ValidationProcessedSegment
                        processedCount={completedChecksInvoiceStats.processedCount}
                        pendingCount={completedChecksInvoiceStats.pendingCount}
                        roundedClass={
                          completedChecksInvoiceStats.pendingCount <= 0
                            ? "rounded-xl"
                            : "rounded-l-xl"
                        }
                      />
                    )}
                    {completedChecksInvoiceStats.pendingCount > 0 && (
                      <div
                        className={`flex min-w-0 overflow-hidden ${
                          completedChecksInvoiceStats.processedCount <= 0
                            ? "flex-1 rounded-xl"
                            : "flex-1 rounded-r-xl"
                        }`}
                        style={{
                          flexGrow: completedChecksInvoiceStats.pendingCount,
                          flexBasis: 0,
                        }}
                        title={`Pending payment: ${completedChecksInvoiceStats.pendingCount}`}
                      >
                        {pendingPaymentFailureBreakdown.totalFailMarks === 0 ? (
                          <div
                            className={`flex w-full items-center justify-center px-1 text-center text-[13px] font-semibold text-[#3f4600] ${PENDING_FAIL_COLORS[0]}`}
                          >
                            {completedChecksInvoiceStats.pendingCount} pending
                          </div>
                        ) : (
                          <div className="flex h-full min-w-0 flex-1">
                            {pendingPaymentFailureBreakdown.items.map(
                              (seg) =>
                                seg.count > 0 && (
                                  <div
                                    key={seg.key}
                                    className={`flex min-w-0 flex-col justify-center px-0.5 text-center text-[12px] font-semibold leading-tight ${seg.textClass} ${seg.colorClass}`}
                                    style={{
                                      flexGrow: seg.count,
                                      flexBasis: 0,
                                    }}
                                    title={`${seg.legend}: ${seg.count}`}
                                  >
                                    <span className="truncate">
                                      {seg.count} {seg.abbr}
                                    </span>
                                  </div>
                                ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span>
                      {completedChecksInvoiceStats.total}{" "}
                      {completedChecksInvoiceStats.total === 1
                        ? "invoice"
                        : "invoices"}{" "}
                      total · {completedChecksInvoiceStats.pendingCount} pending
                      · {completedChecksInvoiceStats.processedCount} processed
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`size-2.5 shrink-0 rounded-sm ${CHART_BAR.pass}`}
                        aria-hidden
                      />
                      <span className="text-foreground">Processed payment</span>
                      <span className="text-muted-foreground">
                        ({completedChecksInvoiceStats.processedCount})
                      </span>
                    </div>
                    {pendingPaymentFailureBreakdown.items.map((seg) => (
                      <div
                        key={seg.key}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <span
                          className={`size-2.5 shrink-0 rounded-sm ${seg.colorClass}`}
                          aria-hidden
                        />
                        <span className="text-foreground">{seg.legend}</span>
                        <span className="text-muted-foreground">
                          ({seg.count})
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <InvoicesTablesSection showInvoicesOnHold={false} />

      </div>
    </div>
  );
}
